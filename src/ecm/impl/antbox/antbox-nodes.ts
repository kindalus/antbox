/*
import { portalenv } from './../../ext/portal-env';
import { saveAs } from 'file-saver';
import { NodeQueryResult } from '../nodes.model';
import { Observable, from, observable, of } from "rxjs";
import { Node } from "../nodes.model";
import { INodeServices } from "../nodes.services";
import { Injectable, Output, EventEmitter } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';


@Injectable({
  providedIn: 'root'
})
export class BBNodeServices implements INodeServices {
  readonly baseUrl: string = portalenv.BaseURL;

  constructor(private http: HttpClient) { }
  copy(uuid: string) {
    // const params = { 'title': title, 'parent': parent };
    const params = { 'uuid': uuid };
    return this.http.post(`${this.baseUrl}/nodes/${uuid}/copy`, params, this.gethttpOptions('json'));

  }

  createDirectory(title: string, parent = 'ROOT'): Observable<any> {
    const params = { 'title': title, 'parent': parent };
    return this.http.post(`${this.baseUrl}/nodes`, params, this.gethttpOptions('text'));

  }
  createFile(file: File, parent = 'ROOT') {
    const form = new FormData();
    form.append('resource', file);
    form.append('parent', parent);
    return this.http.post(`${this.baseUrl}/upload/nodes`, form, this.gethttpOptions('json'));
  }

  delete(uuid: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/nodes/${uuid}`, this.gethttpOptions('text'));
  }
  get(uuid: string): Observable<Node> {
    return this.http.get<Node>(`${this.baseUrl}/nodes/${uuid}`, this.gethttpOptions('json'))
  }

  getContent(uuid: string): Observable<string> {
    return this.http.get<string>(`${this.baseUrl}/nodes/showcontent/${uuid}`, this.gethttpOptions('text'));
  }

  list(
    q: string,
    orderBy: string,
    parents: string,
    pageSize = 25,
    pageToken = 1,
  ): Observable<NodeQueryResult> {
    let url = `${this.baseUrl}/nodes?&orderBy=${orderBy}&parents=${parents}&pageSize=${pageSize}&pageToken=${pageToken}`;
    if (q !== undefined) {
      url = url + `&q=${q}`;
    }
    return this.http.get<NodeQueryResult>(url, this.gethttpOptions('json'));

  }
  update(uuid: string, node: Node): Observable<any> {
    return this.http.patch(`${this.baseUrl}/nodes/${uuid}`, node, this.gethttpOptions('text'));
  }
  evaluate(uuid: string) {
    return new Observable(obs => {
      obs.next();
      obs.complete();
    });
  }

  updateFile(uuid: string, file: File) {
    const form = new FormData();
    form.append('resource', file);
    const result = this.http.patch(`${this.baseUrl}/upload/nodes/${uuid}`, form, this.gethttpOptions('text'));
    return Observable.create((observer) => {
      result.subscribe(data => {
        observer.next(data);
        observer.complete();
      })
    });
  }


  export(uuid: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/nodes/${uuid}/export`, this.gethttpOptions('text'));
  }

  gethttpOptions(type) {
    return { headers: new HttpHeaders({ 'auth-token': localStorage.getItem('rhp_auth_token') }), responseType: type };
  }

  getNodeUrl(uuid: string): Observable<string> {
    return of(`${this.baseUrl}/nodes/${uuid}/export`);
  }
}
*/
