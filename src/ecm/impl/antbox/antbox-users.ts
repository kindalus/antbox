/*
import { portalenv } from '../../ext/portal-env';
import { Observable, from } from "rxjs";
import { Injectable, Output, EventEmitter } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';


@Injectable({
  providedIn: 'root'
})
export class BBUsersServices {
  readonly baseUrl: string = portalenv.BaseURL;

  @Output() FinishAction: EventEmitter<boolean> = new EventEmitter();
  @Output() UpdateAspectNode: EventEmitter<boolean> = new EventEmitter();
  @Output() CreateFileAspect: EventEmitter<string> = new EventEmitter();

  constructor(private http: HttpClient) { }


  delete(uuid: string) {
   return  this.http.delete(`${this.baseUrl}/users/${uuid}`, this.gethttpOptions('text'));
  }
  get(uuid: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/users/${uuid}`, this.gethttpOptions('json'))
  }
  createUser(form) {
   return this.http.post(`${this.baseUrl}/users`, form, this.gethttpOptions('json'));
  }

  list(
    q: string,
    orderBy: string,
    parents: string,
    pageSize = 25,
    pageToken = 1,
  ): Observable<any> {
    return this.http.get(`${this.baseUrl}/users`, this.gethttpOptions('json'));
  }
  update(uuid: string, node: any) {
    return this.http.patch(`${this.baseUrl}/users/${uuid}`, node, this.gethttpOptions('text'));
  }

  gethttpOptions(type) {
    return { headers: new HttpHeaders({ 'auth-token': localStorage.getItem('rhp_auth_token') }), responseType: type };
  }
}
*/
