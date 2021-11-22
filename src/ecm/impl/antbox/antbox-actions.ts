/*
import { ActionsQueryResult, ActionsBuiltInQueryResult } from './../actions.model';
import { portalenv } from '../../ext/portal-env';
import { Observable, from } from 'rxjs';
import { Injectable, Output, EventEmitter } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';


@Injectable({
  providedIn: 'root'
})
export class BBActionsServices {
  readonly baseUrl: string = portalenv.BaseURL;

  @Output() UploadAction: EventEmitter<boolean> = new EventEmitter();
  @Output() DeleteAction: EventEmitter<boolean> = new EventEmitter();
  @Output() RunAction: EventEmitter<boolean> = new EventEmitter();

  constructor(private http: HttpClient) { }

  delete(uuid: string) {
    return  this.http.delete(`${this.baseUrl}/actions/${uuid}`, this.gethttpOptions('text'));
  }
  get(uuid: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/actions/${uuid}`, this.gethttpOptions('json'))
  }


  create(file: File) {
    const form = new FormData();
    form.append('resource', file);
    return this.http.post(`${this.baseUrl}/upload/actions`, form, this.gethttpOptions('json'));
  }

  list(
    mimetype: string,
    aspects: string[],
    orderBy: string,
    pageSize = 25,
    pageToken = 1,
  ): Observable<ActionsQueryResult> {
    let url = `${this.baseUrl}/actions?`;
    if (mimetype !== undefined) {
      url = url + `mimetype=${mimetype}`
    }
    if (aspects !== undefined) {
      url = url + `&aspects=${aspects}`
    }
    if (orderBy !== undefined) {
      url = url + `&orderBy=${orderBy}`
    }
    if (pageSize !== undefined) {
      url = url + `&pageSize=${pageSize}`
    }
    if (pageToken !== undefined) {
      url = url + `&pageToken=${pageToken}`
    }
    return this.http.get<ActionsQueryResult>(url, this.gethttpOptions('json'));
  }


  list_built_in(
    mimetype: string,
    aspects: string[],
    orderBy: string,
    pageSize = 25,
    pageToken = 1,
  ): Observable<ActionsBuiltInQueryResult> {
    let url = `${this.baseUrl}/actions?`;
    if (mimetype !== undefined) {
      url = url + `mimetype=${mimetype}`
    }
    if (aspects !== undefined) {
      url = url + `&aspects=${aspects}`
    }
    if (orderBy !== undefined) {
      url = url + `&orderBy=${orderBy}`
    }
    if (pageSize !== undefined) {
      url = url + `&pageSize=${pageSize}`
    }
    if (pageToken !== undefined) {
      url = url + `&pageToken=${pageToken}`
    }

    return this.http.get<ActionsBuiltInQueryResult>(
      url, this.gethttpOptions('json'));
  }

  run(
    uuid: string,
    nodes: string,
    params: any
  ) {
    let url = `${this.baseUrl}/actions/run/${uuid}?nodes=${nodes}`;

    for (const key in params) {
      if (params.hasOwnProperty(key)) {
        const element = params[key];
        url = url + `&${key}=${element}`
      }
    }
    return this.http.get(url, this.gethttpOptions('text')).subscribe(() => {
      this.RunAction.emit(true);
      return { unsubscribe() { } };
    })
  }

  gethttpOptions(type) {
    return {
      headers: new HttpHeaders({ 'auth-token': localStorage.getItem('rhp_auth_token') }), responseType: type
    };
  }
}
*/
