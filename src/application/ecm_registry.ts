import { AuthService } from "/application/auth_service.ts";
import { ActionService } from "/application/action_service.ts";
import { AspectService } from "/application/aspect_service.ts";
import { NodeService } from "/application/node_service.ts";
import { FidGenerator } from "../domain/nodes/fid_generator.ts";
import { NodeRepository } from "../domain/nodes/node_repository.ts";
import { StorageProvider } from "/domain/providers/storage_provider.ts";
import { UuidGenerator } from "../domain/providers/uuid_generator.ts";
import { GroupRepository } from "../domain/auth/group_repository.ts";
import { PasswordGenerator } from "../domain/auth/password_generator.ts";
import { UserRepository } from "../domain/auth/user_repository.ts";
import { EmailSender } from "./email_sender.ts";

export interface EcmConfig {
  readonly fidGenerator: FidGenerator;
  readonly uuidGenerator: UuidGenerator;
  readonly storage: StorageProvider;
  readonly repository: NodeRepository;

  passwordGenerator: PasswordGenerator;
  emailSender: EmailSender;
  userRepository: UserRepository;
  groupRepository: GroupRepository;
}

export class EcmRegistry {
  private static _instance: EcmRegistry;

  static get instance(): EcmRegistry {
    return EcmRegistry._instance;
  }

  static buildIfNone(ecmConfig: EcmConfig): EcmRegistry {
    if (!EcmRegistry._instance) EcmRegistry.build(ecmConfig);

    return EcmRegistry._instance;
  }

  static build(ecmConfig: EcmConfig): EcmRegistry {
    EcmRegistry._instance = new EcmRegistry(ecmConfig);

    return EcmRegistry._instance;
  }

  constructor(config: EcmConfig) {
    this.authService = new AuthService({
      uuidGenerator: config.uuidGenerator,
      passwordGenerator: config.passwordGenerator,
      emailSender: config.emailSender,
      userRepository: config.userRepository,
      groupRepository: config.groupRepository,
    });

    this.nodeService = new NodeService({
      fidGenerator: config.fidGenerator,
      uuidGenerator: config.uuidGenerator,
      storage: config.storage,
      repository: config.repository,
      authService: this.authService,
    });

    this.aspectService = new AspectService({
      nodeService: this.nodeService,
      auth: this.authService,
    });

    this.actionService = new ActionService({
      authService: this.authService,
      nodeService: this.nodeService,
      aspectService: this.aspectService,
    });

    if (EcmRegistry._instance) return EcmRegistry._instance;
  }

  readonly authService: AuthService;
  readonly nodeService: NodeService;
  readonly aspectService: AspectService;
  readonly actionService: ActionService;
}
