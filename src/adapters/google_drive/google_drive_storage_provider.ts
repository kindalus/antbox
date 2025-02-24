import { createReadStream } from "fs";
import { auth, drive, drive_v3 } from "@googleapis/drive";

import { type Either, left, right } from "shared/either.ts";
import {
  AntboxError,
  BadRequestError,
  UnknownError,
} from "shared/antbox_error.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { type EventHandler } from "shared/event_handler.ts";
import { type Event } from "shared/event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import type {
  StorageProvider,
  WriteFileOpts,
} from "application/storage_provider.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { makeTempFileSync, writeFile } from "shared/os_helpers";

class GoogleDriveStorageProvider implements StorageProvider {
  readonly #drive: drive_v3.Drive;
  readonly #rootFolderId: string;

  constructor(drive: drive_v3.Drive, rootFolderId: string) {
    this.#drive = drive;
    this.#rootFolderId = rootFolderId;
  }

  async delete(uuid: string): Promise<Either<AntboxError, void>> {
    const idOrErr = await this.#getDriveMedata(uuid);

    if (idOrErr.isLeft()) {
      return left(idOrErr.value);
    }

    const { id: fileId } = idOrErr.value;

    return this.#drive.files
      .delete({ fileId })
      .then(right)
      .catch((e: Error) => left(new UnknownError(e.message))) as Promise<
      Either<AntboxError, void>
    >;
  }

  async write(
    uuid: string,
    file: File,
    opts: WriteFileOpts,
  ): Promise<Either<AntboxError, void>> {
    const tmp = makeTempFileSync();
    await writeFile(tmp, file);

    const existingOrErr = await this.#getDriveMedata(uuid);

    const requestBody = {
      name: opts.title,
      parents: [this.#rootFolderId],
      appProperties: { uuid },
      mimeType: file.type,
    };

    const media = {
      mimeType: file.type,
      body: createReadStream(tmp),
    };

    const res = existingOrErr.isRight()
      ? await this.#drive.files.update({
          fileId: existingOrErr.value.id,
          media,
        })
      : await this.#drive.files.create({ media, requestBody });

    if (res.status !== 200) {
      return left(new UnknownError(res.statusText));
    }

    const id = res.data.id!;

    if (existingOrErr.isLeft() && opts.parent !== Folders.ROOT_FOLDER_UUID) {
      this.#updateParentFolderId(id, opts.parent);
    }

    return right<UnknownError, void>(undefined);
  }

  async #updateParentFolderId(fileId: string, parent: string) {
    let parentOrErr = await this.#getDriveMedata(parent);

    if (parentOrErr.isLeft()) {
      const res = await this.#createSystemFolderIfApplicable(parent);

      if (res.isLeft()) {
        console.error(res.value);
        return;
      }

      parentOrErr = await this.#getDriveMedata(parent);

      if (parentOrErr.isLeft()) {
        console.error(parentOrErr.value.message);
        return;
      }
    }

    this.#drive.files
      .update({
        fileId,
        removeParents: this.#rootFolderId,
        addParents: parentOrErr.value.id,
      })
      .catch((e) => console.error(e.message));
  }

  async #handleNodeUpdated(evt: NodeUpdatedEvent) {
    if (!evt.payload.parent && !evt.payload.title) {
      return;
    }

    const fileOrErr = await this.#getDriveMedata(evt.payload.uuid);
    if (fileOrErr.isLeft()) {
      console.error(fileOrErr.value.message);
      return;
    }

    const requestBody: Record<string, string | string[]> = {};

    if (evt.payload.parent) {
      const newParentOrErr = await this.#getDriveMedata(evt.payload.parent);
      if (newParentOrErr.isLeft()) {
        console.error(newParentOrErr.value.message);
        return;
      }

      requestBody["removeParents"] = fileOrErr.value.parents;
      requestBody["addParents"] = newParentOrErr.value.id;
    }

    if (evt.payload.title) {
      requestBody["name"] = evt.payload.title;
    }

    this.#drive.files
      .update({ fileId: fileOrErr.value.id, requestBody })
      .catch((e) => console.error(e.message));
  }

  async #handleNodeDeleted(evt: NodeDeletedEvent) {
    if (!Nodes.isFolder(evt.payload)) {
      return;
    }

    const idOrErr = await this.#getDriveMedata(evt.payload.uuid);
    if (idOrErr.isLeft()) {
      console.error(idOrErr.value);
      return;
    }

    this.#drive.files
      .delete({ fileId: idOrErr.value.id })
      .catch((e) => console.error(e.message));
  }

  async #handleNodeCreated(evt: NodeCreatedEvent) {
    if (!Nodes.isFolder(evt.payload)) {
      return;
    }

    const node = evt.payload;

    let parentId = this.#rootFolderId;

    if (evt.payload.parent !== Folders.ROOT_FOLDER_UUID) {
      const parentOrErr = await this.#getDriveMedata(evt.payload.parent);
      if (parentOrErr.isLeft()) {
        console.error(parentOrErr.value.message);
        return;
      }
      parentId = parentOrErr.value.id;
    }

    return this.#createGoogleDriveFolder(node.uuid, node.title, parentId);
  }

  #createGoogleDriveFolder(uuid: string, title: string, parentId: string) {
    const requestBody = {
      name: title,
      parents: [parentId],
      appProperties: { uuid },
      mimeType: "application/vnd.google-apps.folder",
    };

    return this.#drive.files
      .create({ requestBody })
      .catch((e) => console.error(e.message));
  }

  async read(id: string): Promise<Either<AntboxError, File>> {
    const idOrErr = await this.#getDriveMedata(id);

    if (idOrErr.isLeft()) {
      throw idOrErr.value;
    }

    const { id: fileId, mimeType, name } = idOrErr.value;

    return (
      this.#drive.files
        .get({ fileId, alt: "media" }, { responseType: "arraybuffer" })
        // deno-lint-ignore no-explicit-any
        .then((res: any) =>
          right(new File([res.data], name, { type: mimeType })),
        )
        .catch((e: Error) => left(new UnknownError(e.message))) as Promise<
        Either<AntboxError, File>
      >
    );
  }

  startListeners(
    subscribe: (eventId: string, handler: EventHandler<Event>) => void,
  ): void {
    subscribe(NodeDeletedEvent.EVENT_ID, {
      handle: (evt: NodeDeletedEvent) => this.#handleNodeDeleted(evt),
    });
    subscribe(NodeUpdatedEvent.EVENT_ID, {
      handle: (evt: NodeUpdatedEvent) => this.#handleNodeUpdated(evt),
    });

    subscribe(NodeCreatedEvent.EVENT_ID, {
      handle: (evt: NodeCreatedEvent) => this.#handleNodeCreated(evt),
    });
  }

  async #getDriveMedata(
    uuid: string,
  ): Promise<Either<AntboxError, DriveMetada>> {
    const query = `appProperties has { key='uuid' and value='${uuid}' }`;

    const { data } = await this.#drive.files.list({
      q: query,
      fields: "files(id,mimeType,name,parents,trashed)",
    });

    const files = data.files;

    if (!files || files.length === 0) {
      return left(new NodeNotFoundError(uuid));
    }

    const { id, mimeType, name, parents, trashed } = files[0];

    return right({ id, mimeType, name, parents, trashed } as DriveMetada);
  }

  async #createSystemFolderIfApplicable(uuid: string) {
    if (!Folders.isSystemFolder(uuid)) {
      return left(new BadRequestError("Invalid system folder uuid"));
    }

    const res = await this.#createGoogleDriveFolder(
      uuid,
      uuid,
      this.#rootFolderId,
    );

    if (!res || res.status !== 200) {
      return left(new UnknownError("Error creating system folder"));
    }

    return right(undefined);
  }
}

interface DriveMetada {
  id: string;
  mimeType: string;
  name: string;
  parents: string[];
}

function authenticate(keyFile: string): drive_v3.Drive {
  /**
   * Service account credentials
   * Service accounts allow you to perform server to server, app-level authentication
   * using a robot account. You will create a service account, download a keyfile,
   * and use that to authenticate to Google APIs. To create a service account:
   * https://console.cloud.google.com/apis/credentials/serviceaccountkey
   */
  const client = new auth.GoogleAuth({
    keyFile,
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/drive.appdata",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.metadata",
    ],
  });

  return drive({
    version: "v3",
    auth: client,
  });
}

export default async function buildGoogleDriveStorageProvider(
  keyPath: string,
  rootFolderId: string,
): Promise<Either<AntboxError, StorageProvider>> {
  console.log("Creating Google Drive Storage Provider");
  console.log("Key Path: ", keyPath);
  console.log("Root Folder Id: ", rootFolderId);

  const drive = authenticate(keyPath);

  // Check if root folder exists
  const { status } = await drive.files.get({ fileId: rootFolderId });

  if (status !== 200) {
    return left(new NodeNotFoundError(rootFolderId));
  }

  console.log("Google Drive Storage Provider created");

  const provider = new GoogleDriveStorageProvider(drive, rootFolderId);

  return Promise.resolve(right(provider));
}
