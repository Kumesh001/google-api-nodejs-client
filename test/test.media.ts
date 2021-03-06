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

import * as assert from 'assert';
import * as fs from 'fs';
import * as nock from 'nock';
import * as path from 'path';
import * as pify from 'pify';
import {GoogleApis} from '../src';
import {Utils} from './utils';

const boundaryPrefix = 'multipart/related; boundary=';

async function testMultpart(drive) {
  const resource = {title: 'title', mimeType: 'text/plain'};
  const media = {body: 'hey'};
  let expectedResp = fs.readFileSync(
      path.join(__dirname, '../../test/fixtures/media-response.txt'),
      {encoding: 'utf8'});
  const res = await pify(drive.files.insert)({resource, media});
  assert.equal(res.config.method.toLowerCase(), 'post');
  assert.equal(res.request.path, '/upload/drive/v2/files?uploadType=multipart');
  assert.equal(
      res.request.headers['content-type'].indexOf('multipart/related;'), 0);
  const boundary =
      res.request.headers['content-type'].replace(boundaryPrefix, '');
  expectedResp = expectedResp.replace(/\n/g, '\r\n')
                     .replace(/\$boundary/g, boundary)
                     .replace('$media', media.body)
                     .replace('$resource', JSON.stringify(resource))
                     .replace('$mimeType', 'text/plain')
                     .trim();
  assert.strictEqual(expectedResp, res.data);
}

async function testMediaBody(drive) {
  const resource = {title: 'title'};
  const media = {body: 'hey'};
  let expectedResp = fs.readFileSync(
      path.join(__dirname, '../../test/fixtures/media-response.txt'),
      {encoding: 'utf8'});
  const res = await pify(drive.files.insert)({resource, media});
  assert.equal(res.config.method.toLowerCase(), 'post');
  assert.equal(res.request.path, '/upload/drive/v2/files?uploadType=multipart');
  assert.equal(
      res.request.headers['content-type'].indexOf('multipart/related;'), 0);
  const boundary =
      res.request.headers['content-type'].replace(boundaryPrefix, '');
  expectedResp = expectedResp.replace(/\n/g, '\r\n')
                     .replace(/\$boundary/g, boundary)
                     .replace('$media', media.body)
                     .replace('$resource', JSON.stringify(resource))
                     .replace('$mimeType', 'text/plain')
                     .trim();
  assert.strictEqual(expectedResp, res.data);
}

describe('Media', () => {
  let localDrive, remoteDrive;
  let localGmail, remoteGmail;

  before(async () => {
    nock.cleanAll();
    const google = new GoogleApis();
    nock.enableNetConnect();
    [remoteDrive, remoteGmail] = await Promise.all([
      Utils.loadApi(google, 'drive', 'v2'), Utils.loadApi(google, 'gmail', 'v1')
    ]);
    nock.disableNetConnect();
  });

  beforeEach(() => {
    nock.cleanAll();
    nock.disableNetConnect();
    const google = new GoogleApis();
    localDrive = google.drive('v2');
    localGmail = google.gmail('v1');
  });

  it('should post with uploadType=multipart if resource and media set',
     async () => {
       nock(Utils.baseUrl)
           .post('/upload/drive/v2/files?uploadType=multipart')
           .times(2)
           .reply(200, {fileId: 'abc123'});

       const res = await pify(localDrive.files.insert)(
           {resource: {}, media: {body: 'hello'}});
       assert.equal(
           JSON.stringify(res.data), JSON.stringify({fileId: 'abc123'}));
       const res2 = await pify(remoteDrive.files.insert)(
           {resource: {}, media: {body: 'hello'}});
       assert.equal(
           JSON.stringify(res2.data), JSON.stringify({fileId: 'abc123'}));
     });

  it('should post with uploadType=media media set but not resource',
     async () => {
       nock(Utils.baseUrl)
           .post('/upload/drive/v2/files?uploadType=media')
           .times(2)
           .reply(200, {fileId: 'abc123'});
       const res =
           await pify(localDrive.files.insert)({media: {body: 'hello'}});
       assert.equal(
           JSON.stringify(res.data), JSON.stringify({fileId: 'abc123'}));
       const res2 =
           await pify(remoteDrive.files.insert)({media: {body: 'hello'}});
       assert.equal(
           JSON.stringify(res2.data), JSON.stringify({fileId: 'abc123'}));
     });

  it('should generate a valid media upload if media is set, metadata is not set',
     async () => {
       nock(Utils.baseUrl)
           .post('/upload/drive/v2/files?uploadType=media')
           .times(2)
           .reply(201, (uri, reqBody) => {
             return reqBody;  // return request body as response
                              // for testing purposes
           });
       const media = {body: 'hey'};
       const res = await pify(localDrive.files.insert)({media});
       assert.equal(res.config.method.toLowerCase(), 'post');
       assert.equal(
           res.request.path, '/upload/drive/v2/files?uploadType=media');
       assert.strictEqual(media.body, res.data);
       const res2 = await pify(remoteDrive.files.insert)({media});
       assert.equal(res.config.method.toLowerCase(), 'post');
       assert.equal(
           res.request.path, '/upload/drive/v2/files?uploadType=media');
       assert.strictEqual(media.body, res2.data);
     });

  it('should generate valid multipart upload if media and metadata are both set',
     async () => {
       nock(Utils.baseUrl)
           .post('/upload/drive/v2/files?uploadType=multipart')
           .times(2)
           .reply(201, (uri, reqBody) => {
             return reqBody;  // return request body as response
                              // for testing purposes
           });
       await testMultpart(localDrive);
       await testMultpart(remoteDrive);
     });

  it('should not require parameters for insertion requests', async () => {
    nock(Utils.baseUrl)
        .post('/upload/drive/v2/files?someAttr=someValue&uploadType=media')
        .twice()
        .reply(200);
    const res = await pify(localDrive.files.insert)(
        {someAttr: 'someValue', media: {body: 'wat'}});
    assert.equal(Utils.getQs(res), 'someAttr=someValue&uploadType=media');
    const res2 = await pify(remoteDrive.files.insert)(
        {someAttr: 'someValue', media: {body: 'wat'}});
    assert.equal(Utils.getQs(res2), 'someAttr=someValue&uploadType=media');
  });

  it('should not multipart upload if no media body given', async () => {
    nock(Utils.baseUrl)
        .post('/drive/v2/files?someAttr=someValue')
        .twice()
        .reply(200);
    const res = await pify(localDrive.files.insert)({someAttr: 'someValue'});
    assert.equal(Utils.getQs(res), 'someAttr=someValue');
    const res2 = await pify(remoteDrive.files.insert)({someAttr: 'someValue'});
    assert.equal(Utils.getQs(res2), 'someAttr=someValue');
  });

  it('should set text/plain when passed a string as media body', async () => {
    nock(Utils.baseUrl)
        .post('/upload/drive/v2/files?uploadType=multipart')
        .times(2)
        .reply(201, (uri, reqBody) => {
          return reqBody;  // return request body as response for
                           // testing purposes
        });

    await testMediaBody(localDrive);
    await testMediaBody(remoteDrive);
  });

  it('should handle metadata-only media requests properly', async () => {
    nock(Utils.baseUrl)
        .post('/gmail/v1/users/me/drafts')
        .times(2)
        .reply(201, (uri, reqBody) => {
          return reqBody;  // return request body as response for
                           // testing purposes
        });
    const resource = {
      message: {raw: (new Buffer('hello', 'binary')).toString('base64')}
    };
    const res = await pify(localGmail.users.drafts.create)(
        {userId: 'me', resource, media: {mimeType: 'message/rfc822'}});
    assert.equal(
        res.request.headers['content-type'].indexOf('application/json'), 0);
    assert.equal(JSON.stringify(res.data), JSON.stringify(resource));
    const res2 = await pify(remoteGmail.users.drafts.create)(
        {userId: 'me', resource, media: {mimeType: 'message/rfc822'}});
    assert.equal(
        res2.request.headers['content-type'].indexOf('application/json'), 0);
    assert.equal(JSON.stringify(res2.data), JSON.stringify(resource));
  });

  it('should accept readable stream as media body without metadata',
     async () => {
       nock(Utils.baseUrl)
           .post('/upload/gmail/v1/users/me/drafts?uploadType=media')
           .times(2)
           .reply(201, (uri, reqBody) => {
             return reqBody;  // return request body as response for
                              // testing purposes
           });
       let body = fs.createReadStream(
           path.join(__dirname, '../../test/fixtures/mediabody.txt'));
       let expectedBody = fs.readFileSync(
           path.join(__dirname, '../../test/fixtures/mediabody.txt'));
       const res = await pify(localGmail.users.drafts.create)(
           {userId: 'me', media: {mimeType: 'message/rfc822', body}});
       assert.equal(res.data, expectedBody);
       body = fs.createReadStream(
           path.join(__dirname, '../../test/fixtures/mediabody.txt'));
       expectedBody = fs.readFileSync(
           path.join(__dirname, '../../test/fixtures/mediabody.txt'));
       const res2 = await pify(remoteGmail.users.drafts.create)(
           {userId: 'me', media: {mimeType: 'message/rfc822', body}});
       assert.equal(res2.data, expectedBody);
     });

  it('should accept readable stream as media body with metadata', async () => {
    nock(Utils.baseUrl)
        .post('/upload/gmail/v1/users/me/drafts?uploadType=multipart')
        .times(2)
        .reply(201, (uri, reqBody) => {
          return reqBody;  // return request body as response for testing
                           // purposes
        });

    let resource = {
      message: {raw: (new Buffer('hello', 'binary')).toString('base64')}
    };
    let body = fs.createReadStream(
        path.join(__dirname, '../../test/fixtures/mediabody.txt'));
    let bodyString = fs.readFileSync(
        path.join(__dirname, '../../test/fixtures/mediabody.txt'),
        {encoding: 'utf8'});
    let media = {mimeType: 'message/rfc822', body};
    let expectedBody = fs.readFileSync(
        path.join(__dirname, '../../test/fixtures/media-response.txt'),
        {encoding: 'utf8'});
    const res = await pify(localGmail.users.drafts.create)(
        {userId: 'me', resource, media});
    const boundary =
        res.request.headers['content-type'].replace(boundaryPrefix, '');
    expectedBody = expectedBody.replace(/\n/g, '\r\n')
                       .replace(/\$boundary/g, boundary)
                       .replace('$media', bodyString)
                       .replace('$resource', JSON.stringify(resource))
                       .replace('$mimeType', 'message/rfc822')
                       .trim();
    assert.strictEqual(expectedBody, res.data);
    resource = {
      message: {raw: (new Buffer('hello', 'binary')).toString('base64')}
    };
    body = fs.createReadStream(
        path.join(__dirname, '../../test/fixtures/mediabody.txt'));
    bodyString = fs.readFileSync(
        path.join(__dirname, '../../test/fixtures/mediabody.txt'),
        {encoding: 'utf8'});
    media = {mimeType: 'message/rfc822', body};
    expectedBody = fs.readFileSync(
        path.join(__dirname, '../../test/fixtures/media-response.txt'),
        {encoding: 'utf8'});
    const res2 = await pify(remoteGmail.users.drafts.create)(
        {userId: 'me', resource, media});
    const boundary2 =
        res2.request.headers['content-type'].replace(boundaryPrefix, '');
    expectedBody = expectedBody.replace(/\n/g, '\r\n')
                       .replace(/\$boundary/g, boundary2)
                       .replace('$media', bodyString)
                       .replace('$resource', JSON.stringify(resource))
                       .replace('$mimeType', 'message/rfc822')
                       .trim();
    assert.strictEqual(expectedBody, res2.data);
  });

  it('should return err, {object}body, resp for streaming media requests',
     async () => {
       nock(Utils.baseUrl)
           .post('/upload/gmail/v1/users/me/drafts?uploadType=multipart')
           .times(2)
           .reply(201, () => {
             return JSON.stringify({hello: 'world'});
           });

       let resource = {
         message: {raw: (new Buffer('hello', 'binary')).toString('base64')}
       };
       const body = fs.createReadStream(
           path.join(__dirname, '../../test/fixtures/mediabody.txt'));
       let media = {mimeType: 'message/rfc822', body};
       const res = await pify(localGmail.users.drafts.create)(
           {userId: 'me', resource, media});
       assert.equal(typeof res.data, 'object');
       assert.equal(res.data.hello, 'world');
       assert.equal(typeof res, 'object');
       resource = {
         message: {raw: (new Buffer('hello', 'binary')).toString('base64')}
       };
       const body2 = fs.createReadStream(
           path.join(__dirname, '../../test/fixtures/mediabody.txt'));
       media = {mimeType: 'message/rfc822', body: body2};
       const res2 = await pify(remoteGmail.users.drafts.create)(
           {userId: 'me', resource, media});
       assert.equal(typeof res2.data, 'object');
       assert.equal(res2.data.hello, 'world');
       assert.equal(typeof res2, 'object');
     });

  after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });
});
