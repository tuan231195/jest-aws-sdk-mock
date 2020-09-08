# jest-aws-sdk-mock

Create Jest Mocks for AWS SDK services.

[![Build Status](https://travis-ci.org/tuan231195/jest-aws-sdk-mock.svg?branch=master)](https://travis-ci.org/tuan231195/jest-aws-sdk-mock)
[![codecov](https://codecov.io/gh/tuan231195/jest-aws-sdk-mock/branch/master/graph/badge.svg)](https://codecov.io/gh/tuan231195/jest-aws-sdk-mock)

This module was created to help test AWS Lambda functions but can be used in any situation where the AWS SDK needs to be mocked. This is a rewrite of https://github.com/dwyl/aws-sdk-mock but using jest under the hood instead of sinon.js.

* [What](#what)
* [Getting Started](#how-usage)
* [Documentation](#documentation)

## What?

Uses Jest under the hood to mock the AWS SDK services and their associated methods.

## *How*? (*Usage*)

### *install* `jest-aws-sdk-mock` from NPM

```sh
npm install jest-aws-sdk-mock --save-dev
```

### Use in your Tests

#### Using plain JavaScript

```js

const AWSMock = require('jest-aws-sdk-mock');

AWSMock.mock('DynamoDB', 'putItem', function (params, callback){
  callback(null, 'successfully put item in database');
});

AWSMock.mock('SNS', 'publish', 'test-message');

// S3 getObject mock - return a Buffer object with file data
AWSMock.mock('S3', 'getObject', Buffer.from(require('fs').readFileSync('testFile.csv')));


/**
    TESTS
**/

AWSMock.restore('SNS', 'publish');
AWSMock.restore('DynamoDB');
AWSMock.restore('S3');
// or AWSMock.restore(); this will restore all the methods and services
```

#### Using TypeScript

```typescript
import AWSMock from 'jest-aws-sdk-mock';
import AWS from 'aws-sdk';
import { GetItemInput } from 'aws-sdk/clients/dynamodb';

describe('the module', () => {
  afterEach(() => {
    AWSMock.restore();
  });

  it('should mock getItem from DynamoDB', async () => {
    // Overwriting DynamoDB.getItem()
    AWSMock.setSDKInstance(AWS);
    AWSMock.mock('DynamoDB', 'getItem', (params: GetItemInput, callback: Function) => {
      console.log('DynamoDB', 'getItem', 'mock called');
      callback(null, {pk: 'foo', sk: 'bar'});
    })

    const input:GetItemInput = { TableName: '', Key: {} };
    const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
    expect(await dynamodb.getItem(input).promise()).toEqual({ pk: 'foo', sk: 'bar' });

    AWSMock.restore('DynamoDB');
  });

  it('should mock reading from DocumentClient', async () => {
    // Overwriting DynamoDB.DocumentClient.get()
    AWSMock.setSDKInstance(AWS);
    AWSMock.mock('DynamoDB.DocumentClient', 'get', (params: GetItemInput, callback: Function) => {
      console.log('DynamoDB.DocumentClient', 'get', 'mock called');
      callback(null, {pk: 'foo', sk: 'bar'});
    });

    const input:GetItemInput = { TableName: '', Key: {} };
    const client = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
    expect(await client.get(input).promise()).toEqual({ pk: 'foo', sk: 'bar' });
  });
});
```

### Notes: 

* The AWS Service needs to be initialised after the invocation of the `mock` function

The below won't work
```typescript
const AWS = require('aws-sdk');
const AWSMock = require('jest-aws-sdk-mock');

const sns = new AWS.SNS();
// won't override sns.publish
AWSMock.mock('SNS', 'publish', 'message');
```

* The mock function will be overwritten if you call mock on the same method again

```typescript
AWSMock.mock('SNS', 'publish', function(params, callback) {
    callback(null, 'message');
});
const sns = new AWS.SNS();
AWSMock.mock('SNS', 'publish', function(params, callback) {
    callback(null, 'test');
});
sns.publish({} as any, function(err, data) {
    expect(data).toBe('test');
    done();
});
```

* Individual SDK import will work

```typescript
AWSMock.mock('S3', 'getObject', function(params, callback) {
    callback(null, 'message');
});
const S3 = require('aws-sdk/clients/s3');
const s3 = new S3();
const result = await s3.getObject({} as any).promise();
expect(result).toEqual('message');
done();
```

### Nested services

It is possible to mock nested services like `DynamoDB.DocumentClient`. Simply use this dot-notation name as the `service` parameter to the `mock()` and `restore()` methods:

```js
AWS.mock('DynamoDB.DocumentClient', 'get', function(params, callback) {
  callback(null, {Item: {Key: 'Value'}});
});
```

**NB: Use caution when mocking both a nested service and its parent service.** The nested service should be mocked before and restored after its parent:

```js
// OK
AWS.mock('DynamoDB.DocumentClient', 'get', 'message');
AWS.mock('DynamoDB', 'describeTable', 'message');
AWS.restore('DynamoDB');
AWS.restore('DynamoDB.DocumentClient');

// Not OK
AWS.mock('DynamoDB', 'describeTable', 'message');
AWS.mock('DynamoDB.DocumentClient', 'get', 'message');

// Not OK
AWS.restore('DynamoDB.DocumentClient');
AWS.restore('DynamoDB');
```

### Setting the `aws-sdk` module explicitly

Project structures that don't include the `aws-sdk` at the top level `node_modules` project folder will not be properly mocked.  An example of this would be installing the `aws-sdk` in a nested project directory. You can get around this by explicitly setting the path to a nested `aws-sdk` module using `setSDK()`.

Example:

```js
const path = require('path');
const AWS = require('jest-aws-sdk-mock');

AWS.setSDK(path.resolve('../../functions/foo/node_modules/aws-sdk'));

/**
    TESTS
**/
```

### Setting the `aws-sdk` object explicitly

Due to transpiling, code written in TypeScript or ES6 may not correctly mock because the `aws-sdk` object created within `aws-sdk-mock` will not be equal to the object created within the code to test. In addition, it is sometimes convenient to have multiple SDK instances in a test. For either scenario, it is possible to pass in the SDK object directly using `setSDKInstance()`.

Example:

```js
// test code
const AWSMock = require('jest-aws-sdk-mock');
import AWS from 'aws-sdk';
AWSMock.setSDKInstance(AWS);
AWSMock.mock('SQS', /* ... */);

// implementation code
const sqs = new AWS.SQS();
```

### Configuring promises

If your environment lacks a global Promise constructor (e.g. nodejs 0.10), you can explicitly set the promises on `aws-sdk-mock`. Set the value of `AWS.Promise` to the constructor for your chosen promise library.

Example (if Q is your promise library of choice):

```js
const AWS = require('jest-aws-sdk-mock'),
    Q = require('q');

AWS.Promise = Q.Promise;


/**
    TESTS
**/
```

## Documentation

### `AWS.mock(service, method, replace)`

Replaces a method on an AWS service with a replacement function or string.

| Param | Type | Optional/Required | Description     |
| :------------- | :------------- | :------------- | :------------- |
| `service`      | string    | Required     | AWS service to mock e.g. SNS, DynamoDB, S3     |
| `method`      | string    | Required     | method on AWS service to mock e.g. 'publish' (for SNS), 'putItem' for 'DynamoDB'     |
| `replace`      | string or function    | Required     | A string or function to replace the method   |

### `AWS.restore(service, method)`

Removes the mock to restore the specified AWS service

| Param | Type | Optional/Required | Description     |
| :------------- | :------------- | :------------- | :------------- |
| `service`      | string    | Optional     | AWS service to restore - If only the service is specified, all the methods are restored     |
| `method`      | string    | Optional     | Method on AWS service to restore    |

If `AWS.restore` is called without arguments (`AWS.restore()`) then all the services and their associated methods are restored
i.e. equivalent to a 'restore all' function.

### `AWS.setSDK(path)`

Explicitly set the require path for the `aws-sdk`

| Param | Type | Optional/Required | Description     |
| :------------- | :------------- | :------------- | :------------- |
| `path`      | string    | Required     | Path to a nested AWS SDK node module     |

### `AWS.setSDKInstance(sdk)`

Explicitly set the `aws-sdk` instance to use

| Param | Type | Optional/Required | Description     |
| :------------- | :------------- | :------------- | :------------- |
| `sdk`      | object    | Required     | The AWS SDK object     |
