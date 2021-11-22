/*
import { IAspectsServices } from '../aspects.services';
import { AspectQueryResult, Aspect } from '../aspects.model';
import { Observable } from 'rxjs';
import { Injectable, Output, EventEmitter } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { portalenv } from './../../ext/portal-env';

@Injectable({
  providedIn: 'root'
})
export class BBAspectServices implements IAspectsServices {
  readonly baseUrl: string = portalenv.BaseURL;
  httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json'
    })
  };
  @Output() FinishAction: EventEmitter<boolean> = new EventEmitter();

  constructor(private http: HttpClient) { }

  create(aspect: Aspect): Observable<any> {
    return this.http.post(`${this.baseUrl}/upload/aspects`, aspect, this.gethttpOptions('text'));
  }

  createFile(file: File) {
    const form = new FormData();
    form.append('resource', file);
    return this.http.post(`${this.baseUrl}/upload/aspects`, form, this.gethttpOptions('text'));
  }
  delete(uuid: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/aspects/${uuid}`, this.gethttpOptions('text'));
  }
  get(uuid: string): Observable<Aspect> {
    return this.http.get<Aspect>(`${this.baseUrl}/aspects/${uuid}`, this.gethttpOptions('json'))
  }
  update(uuid: string, aspect: Aspect): Observable<any> {
    return this.http.patch(`${this.baseUrl}/upload/aspects/${uuid}`, aspect, this.gethttpOptions('text'));
  }
  
  list(
    q: string,
    orderBy: string,
    pageSize = 25,
    pageToken = 1
  ): Observable<AspectQueryResult> {
    let url = `${this.baseUrl}/aspects?orderBy=${orderBy}&pageSize=${pageSize}&pageToken=${pageToken}`;
    if (q !== undefined) {
      url = url + `&q=${q}`;
    }
    return this.http.get<AspectQueryResult>(url, this.gethttpOptions('json'));
  }

  gethttpOptions(type, params = undefined) {
    if (params !== undefined) {
      return {
        headers: new HttpHeaders({ 'auth-token': localStorage.getItem('rhp_auth_token'), 'mimeType': params }), responseType: type
      };
    } else {
      return {
        headers: new HttpHeaders({ 'auth-token': localStorage.getItem('rhp_auth_token') }), responseType: type
      };
    }
  }


}
*/
