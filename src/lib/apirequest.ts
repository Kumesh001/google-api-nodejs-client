// Copyright 2014-2016, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {AxiosRequestConfig} from 'axios';
import {DefaultTransporter, OAuth2Client} from 'google-auth-library';
import {BodyResponseCallback} from 'google-auth-library/build/src/transporters';
import * as qs from 'qs';
import * as stream from 'stream';
import * as parseString from 'string-template';
import * as uuid from 'uuid';
import {APIRequest} from './discovery';

export interface APIRequestParams {
  options: AxiosRequestConfig;
  params: APIRequestMethodParams;
  // tslint:disable-next-line no-any
  requiredParams: any[];
  // tslint:disable-next-line no-any
  pathParams: any[];
  context: APIRequestContext;
  mediaUrl?: string|null;
}

export interface APIRequestContext {
  google: {_options: APIRequestContextOptions;};
  _options: APIRequestContextOptions;
}

export interface APIRequestContextOptions {
  // tslint:disable-next-line no-any
  params?: any;
  auth?: OAuth2Client|string|null;
}

export interface APIRequestMethodParams {
  url?: string;
  media?: {body?: string|stream.Readable; mimeType?: string;};
  resource?: {mimeType?: string;};
  key?: string;
  uploadType?: string;
  auth?: OAuth2Client|string|null;
  // tslint:disable-next-line no-any
  headers?: any;
}

// tslint:disable-next-line: no-any
function isReadableStream(obj: any) {
  return obj instanceof stream.Readable && typeof obj._read === 'function';
}

function createCallback<T>(callback: BodyResponseCallback<T>) {
  return typeof callback === 'function' ? callback : (err: Error|null) => {
    if (err) {
      console.error(err);
    }
  };
}

function getMissingParams(params, required) {
  // tslint:disable-next-line no-any
  const missing = new Array<any>();

  required.forEach(param => {
    // Is the required param in the params object?
    if (params[param] === undefined) {
      missing.push(param);
    }
  });

  // If there are any required params missing, return their names in array,
  // otherwise return null
  return missing.length > 0 ? missing : null;
}

/**
 * Create and send request to Google API
 * @param parameters Parameters used to form request
 * @param callback   Callback when request finished or error found
 */
export function createAPIRequest<T>(
    parameters: APIRequestParams, callback: BodyResponseCallback<T>): void {
  let missingParams;
  let params = parameters.params;
  let options = Object.assign({}, parameters.options);

  // If the params are not present, and callback was passed instead,
  // use params as the callback and create empty params.
  if (typeof params === 'function') {
    callback = params;
    params = {};
  }

  // Create a new params object so it can no longer be modified from outside
  // code Also support global and per-client params, but allow them to be
  // overriden per-request
  params = Object.assign(
      {},                                         // New base object
      parameters.context.google._options.params,  // Global params
      parameters.context._options.params,         // Per-client params
      params                                      // API call params
  );

  const media = params.media || {};
  const resource = params.resource;
  let authClient = params.auth || parameters.context._options.auth ||
      parameters.context.google._options.auth;

  const defaultMime = typeof media.body === 'string' ?
      'text/plain' :
      'application/octet-stream';
  delete params.media;
  delete params.resource;
  delete params.auth;

  // Grab headers from user provided options
  const headers = params.headers || {};
  delete params.headers;

  // Un-alias parameters that were modified due to conflicts with reserved names
  Object.keys(params).forEach(key => {
    if (key.slice(-1) === '_') {
      const newKey = key.slice(0, -1);
      params[newKey] = params[key];
      delete params[key];
    }
  });

  // Normalize callback
  callback = createCallback<T>(callback);

  // Check for missing required parameters in the API request
  missingParams = getMissingParams(params, parameters.requiredParams);
  if (missingParams) {
    // Some params are missing - stop further operations and inform the
    // developer which required params are not included in the request
    return callback(
        new Error('Missing required parameters: ' + missingParams.join(', ')));
  }

  // Parse urls
  if (options.url) {
    options.url = parseString(options.url, params);
  }
  if (parameters.mediaUrl) {
    parameters.mediaUrl = parseString(parameters.mediaUrl, params);
  }

  // When forming the querystring, override the serializer so that array
  // values are serialized like this:
  // myParams: ['one', 'two'] ---> 'myParams=one&myParams=two'
  // This serializer also encodes spaces in the querystring as `%20`,
  // whereas the default serializer in axios encodes to a `+`.
  options.paramsSerializer = (params) => {
    return qs.stringify(params, {arrayFormat: 'repeat'});
  };

  // delete path parameters from the params object so they do not end up in
  // query
  parameters.pathParams.forEach(param => {
    delete params[param];
  });

  // if authClient is actually a string, use it as an API KEY
  if (typeof authClient === 'string') {
    params.key = params.key || authClient;
    authClient = null;
  }

  if (parameters.mediaUrl && media.body) {
    options.url = parameters.mediaUrl;
    if (resource) {
      // Axios doesn't support multipart/related uploads, so it has to
      // be implemented here.
      params.uploadType = 'multipart';
      const multipart = [
        {'Content-Type': 'application/json', body: JSON.stringify(resource)}, {
          'Content-Type':
              media.mimeType || (resource && resource.mimeType) || defaultMime,
          body: media.body  // can be a readable stream or raw string!
        }
      ];
      const boundary = uuid.v4();
      const finale = `--${boundary}--`;
      const rStream = new stream.PassThrough();
      const isStream = isReadableStream(multipart[1].body);
      headers['Content-Type'] = `multipart/related; boundary=${boundary}`;
      for (const part of multipart) {
        const preamble =
            `--${boundary}\r\nContent-Type: ${part['Content-Type']}\r\n\r\n`;
        rStream.push(preamble);
        if (typeof part.body === 'string') {
          rStream.push(part.body);
          rStream.push('\r\n');
        } else {
          part.body.pipe(rStream, {end: false});
          part.body.on('end', () => {
            rStream.push('\r\n');
            rStream.push(finale);
            rStream.push(null);
          });
        }
      }
      if (!isStream) {
        rStream.push(finale);
        rStream.push(null);
      }
      options.data = rStream;
    } else {
      params.uploadType = 'media';
      Object.assign(headers, {'Content-Type': media.mimeType || defaultMime});
      options.data = media.body;
    }
  } else {
    options.data = resource || undefined;
  }

  options.headers = headers;
  options.params = params;
  options = Object.assign(
      {}, parameters.context.google._options, parameters.context._options,
      options);
  delete options.auth;  // is overridden by our auth code

  // create request (using authClient or otherwise and return request obj)
  if (authClient && typeof authClient === 'object') {
    authClient.request(options, callback);
  } else {
    (new DefaultTransporter()).request(options, callback);
  }
}
