import * as AWSMock from './index';
import AWS from 'aws-sdk';
import concatStream from 'concat-stream';
import { Readable } from 'stream';

AWS.config.paramValidation = false;

describe('aws-sdk-mock', () => {
	afterEach(() => {
		AWSMock.restore();
	});

	it('should replace method with a function that returns the replace string', done => {
		AWSMock.mock('SNS', 'publish', 'message');
		const sns = new AWS.SNS();
		(async () => {
			const promisedResult = await sns.publish({} as any).promise();
			expect(promisedResult).toEqual('message');
			sns.publish({} as any, function(err, data) {
				expect(data).toEqual('message');
				done();
			});
		})();
	});

	it('should replace method with a callback function', done => {
		AWSMock.mock('SNS', 'publish', function(params, callback) {
			callback(null, 'message');
		});
		const sns = new AWS.SNS();
		(async () => {
			const promisedResult = await sns.publish({} as any).promise();
			expect(promisedResult).toEqual('message');
			sns.publish({} as any, function(err, data) {
				expect(data).toEqual('message');
				done();
			});
		})();
	});

	it('should be able to return an error', done => {
		AWSMock.mock('SNS', 'publish', function(params, callback) {
			callback(new Error('bad'));
		});
		const sns = new AWS.SNS();
		(async () => {
			try {
				await sns.publish({} as any).promise();
				expect(true).toBeFalsy();
			} catch (e) {
				expect(e).toBeInstanceOf(Error);
			}

			sns.publish({} as any, function(err) {
				expect(err).toBeDefined();
				done();
			});
		})();
	});

	it('should replace method with multiple arguments', done => {
		AWSMock.mock('S3', 'getSignedUrl', 'message');
		const s3 = new AWS.S3();
		s3.getSignedUrl('getObject', {} as any, function(err, data) {
			expect(data).toEqual('message');
			done();
		});
	});

	it('should replace method with multiple arguments', done => {
		AWSMock.mock('S3', 'getSignedUrl', function(...args) {
			const params = args.slice(0, args.length - 1);
			const callback = args[args.length - 1];
			expect(params).toEqual(['getObject', 'args']);
			callback('message');
			done();
		});
		const s3 = new AWS.S3();
		s3.getSignedUrl('getObject', 'args');
	});

	it('should fail on invalid input if paramValidation is set', done => {
		AWSMock.mock('S3', 'getObject', { Body: 'body' });
		const s3 = new AWS.S3({ paramValidation: true });
		s3.getObject({ Bucket: 'b', notKey: 'k' } as any, function(err) {
			expect(err).toBeDefined();
			done();
		});
	});

	it('should not fail on method with no input rules', done => {
		AWSMock.mock('S3', 'getSignedUrl', 'message');
		const s3 = new AWS.S3({ paramValidation: true });
		s3.getSignedUrl('getObject', {}, function(err, data) {
			expect(data).toBe('message');
			done();
		});
	});

	it('should remock', done => {
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
	});

	it('should mock multiple methods on the same service', done => {
		AWSMock.mock('Lambda', 'getFunction', function(params, callback) {
			callback(null, 'getFunction');
		});
		AWSMock.mock('Lambda', 'createFunction', function(params, callback) {
			callback(null, 'createFunction');
		});
		const lambda = new AWS.Lambda();
		lambda.getFunction({} as any, function(err, data) {
			expect(data).toBe('getFunction');
			lambda.createFunction({} as any, function(err, data) {
				expect(data).toBe('createFunction');
				done();
			});
		});
	});

	it('should not raise  no unhandled promise rejections when promises are not used', done => {
		process.on('unhandledRejection', () => {
			done(new Error('unhandledRejection, reason follows'));
		});
		AWSMock.mock('S3', 'getObject', function(params, callback) {
			callback(
				new Error(
					'This is a test error to see if promise rejections go unhandled'
				)
			);
		});
		const S3 = new AWS.S3();
		S3.getObject({} as any, function(err) {
			expect(err).toBeDefined();
		});
		done();
	});

	it('should support promise in the mock function', done => {
		AWSMock.mock('Lambda', 'getFunction', async function() {
			return 'getFunction';
		});

		(async () => {
			const lambda = new AWS.Lambda();
			const promiseResult = await lambda.getFunction({} as any).promise();
			expect(promiseResult).toEqual('getFunction');

			lambda.getFunction({} as any, function(err, callbackResult) {
				expect(callbackResult).toEqual('getFunction');
				done();
			});
		})();
	});

	it('should support promise error in the mock function', done => {
		AWSMock.mock('Lambda', 'getFunction', async function() {
			throw new Error('bad');
		});

		(async () => {
			const lambda = new AWS.Lambda();
			try {
				await lambda.getFunction({} as any).promise();
				expect(true).toBeFalsy();
			} catch (e) {
				expect(e).toBeInstanceOf(Error);
			}

			lambda.getFunction({} as any, function(err) {
				expect(err).toBeDefined();
				done();
			});
		})();
	});

	it('should allow configurable promise', async function() {
		AWSMock.mock('Lambda', 'getFunction', function(params, callback) {
			callback(null, 'message');
		});
		const lambda = new AWS.Lambda();
		function P(handler) {
			handler(
				value => {
					// @ts-ignore
					this.value = value;
				},
				// eslint-disable-next-line @typescript-eslint/no-empty-function
				function() {}
			);
		}
		P.prototype.then = function(yay) {
			if (this.value) yay(this.value);
		};
		AWS.config.setPromisesDependency(P);
		const promise = lambda.getFunction({} as any).promise();
		expect(promise.constructor.name).toEqual('P');
		expect(await promise).toEqual('message');
	});

	it('should support createReadStream', done => {
		AWSMock.mock('S3', 'getObject', 'body');
		const s3 = new AWS.S3();
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		const req = s3.getObject({} as any, function() {});
		const stream = req.createReadStream();
		expect(isStream(stream));
		stream.pipe(
			concatStream(function() {
				done();
			})
		);
	});

	it('should support passing Readable into mock function', done => {
		const bodyStream = new Readable();
		bodyStream.push('body');
		bodyStream.push(null);
		AWSMock.mock('S3', 'getObject', bodyStream);
		const stream = new AWS.S3().getObject({} as any).createReadStream();
		stream.pipe(
			concatStream(function(actual) {
				expect(actual.toString()).toEqual('body');
				done();
			})
		);
	});

	it('request object createReadStream works with strings', done => {
		AWSMock.mock('S3', 'getObject', 'body');
		const s3 = new AWS.S3();
		const req = s3.getObject({} as any);
		const stream = req.createReadStream();
		stream.pipe(
			concatStream(function(actual) {
				expect(actual.toString()).toEqual('body');
				done();
			})
		);
	});

	it('createReadStream should work with buffers', done => {
		AWSMock.mock('S3', 'getObject', Buffer.alloc(4, 'body'));
		const s3 = new AWS.S3();
		const req = s3.getObject({} as any);
		const stream = req.createReadStream();
		stream.pipe(
			concatStream(function(actual) {
				expect(actual.toString()).toEqual('body');
				done();
			})
		);
	});

	it('createReadStream should ignore non buffer objects', done => {
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		AWSMock.mock('S3', 'getObject', () => {});
		const s3 = new AWS.S3();
		const req = s3.getObject({} as any);
		const stream = req.createReadStream();
		stream.pipe(
			concatStream(function(actual) {
				expect(actual.toString()).toEqual('');
				done();
			})
		);
	});

	it('call on method of request object', () => {
		AWSMock.mock('S3', 'getObject', { Body: 'body' } as any);
		const s3 = new AWS.S3();
		const req = s3.getObject({} as any);
		expect(typeof req.on).toBe('function');
	});

	it('call send method of request object', () => {
		AWSMock.mock('S3', 'getObject', { Body: 'body' } as any);
		const s3 = new AWS.S3();
		const req = s3.getObject({} as any);
		expect(typeof req.send).toBe('function');
	});

	it('a nested service can be mocked properly', done => {
		AWSMock.mock('DynamoDB.DocumentClient', 'put', function(
			params,
			callback
		) {
			callback(null, 'put');
		});
		AWSMock.mock('DynamoDB.DocumentClient', 'get', 'get');

		const docClient = new AWS.DynamoDB.DocumentClient();

		docClient.put({} as any, function(err, data) {
			expect(data).toEqual('put');
			docClient.get({} as any, function(err, data) {
				expect(data).toEqual('get');
				done();
			});
		});
	});

	it('a mocked service and a mocked nested service can coexist as long as the nested service is mocked first', () => {
		AWSMock.mock('DynamoDB', 'getItem', 'getItem');
		AWSMock.mock('DynamoDB.DocumentClient', 'get', 'get');
		let docClient = new AWS.DynamoDB.DocumentClient();
		let dynamoDb = new AWS.DynamoDB();

		expect(jest.isMockFunction(docClient.get)).toBeTruthy();
		expect(jest.isMockFunction(dynamoDb.getItem)).toBeTruthy();

		AWSMock.restore('DynamoDB.DocumentClient');

		docClient = new AWS.DynamoDB.DocumentClient();

		expect(jest.isMockFunction(docClient.get)).toBeFalsy();
		expect(jest.isMockFunction(dynamoDb.getItem)).toBeTruthy();

		AWSMock.restore('DynamoDB');
		dynamoDb = new AWS.DynamoDB();

		expect(jest.isMockFunction(docClient.get)).toBeFalsy();
		expect(jest.isMockFunction(dynamoDb.getItem)).toBeFalsy();
	});

	it('all the methods on a service are restored', () => {
		AWSMock.mock('SNS', 'publish', function(params, callback) {
			callback(null, 'message');
		});

		const sns = new AWS.SNS();
		expect(jest.isMockFunction(sns.publish)).toBeTruthy();

		AWSMock.restore('SNS');

		expect(jest.isMockFunction(sns.publish)).toBeFalsy();
	});
	it('only the method on the service is restored', () => {
		AWSMock.mock('SNS', 'publish', function(params, callback) {
			callback(null, 'message');
		});
		AWSMock.mock('SNS', 'createTopic', function(params, callback) {
			callback(null, 'message');
		});
		const sns = new AWS.SNS();

		expect(jest.isMockFunction(sns.publish)).toBeTruthy();
		expect(jest.isMockFunction(sns.createTopic)).toBeTruthy();

		AWSMock.restore('SNS', 'publish');

		expect(jest.isMockFunction(sns.publish)).toBeFalsy();
		expect(jest.isMockFunction(sns.createTopic)).toBeTruthy();
	});

	it('all the services are restored when no arguments given to AWSMock.restore', () => {
		AWSMock.mock('SNS', 'publish', function(params, callback) {
			callback(null, 'message');
		});
		AWSMock.mock('DynamoDB', 'putItem', function(params, callback) {
			console.log(params, callback);
			callback(null, 'test');
		});
		AWSMock.mock('DynamoDB.DocumentClient', 'put', function(
			params,
			callback
		) {
			callback(null, 'test');
		});
		const sns = new AWS.SNS();
		const docClient = new AWS.DynamoDB.DocumentClient();
		const dynamoDb = new AWS.DynamoDB();

		expect(jest.isMockFunction(sns.publish)).toBeTruthy();
		expect(jest.isMockFunction(docClient.put)).toBeTruthy();
		expect(jest.isMockFunction(dynamoDb.putItem)).toBeTruthy();

		AWSMock.restore();

		expect(jest.isMockFunction(sns.publish)).toBeFalsy();
		expect(jest.isMockFunction(docClient.put)).toBeFalsy();
		expect(jest.isMockFunction(dynamoDb.putItem)).toBeFalsy();
	});

	it('mock individual import', done => {
		jest.isolateModules(async () => {
			AWSMock.mock('S3', 'getObject', function(params, callback) {
				callback(null, 'message');
			});
			const S3 = require('aws-sdk/clients/s3');
			const s3 = new S3();
			const result = await s3.getObject({} as any).promise();
			expect(result).toEqual('message');
			done();
		});
	});

	it('restore for individual import', done => {
		jest.isolateModules(() => {
			AWSMock.mock('S3', 'getObject', function(params, callback) {
				callback(null, 'message');
			});
			const S3 = require('aws-sdk/clients/s3');
			const s3 = new S3();
			expect(jest.isMockFunction(s3.getObject)).toBeTruthy();

			AWSMock.restore('S3');

			expect(jest.isMockFunction(s3.getObject)).toBeFalsy();
			done();
		});
	});

	describe('AWS.setSDK function should mock a specific AWS module', () => {
		it('Specific Modules can be set for mocking', done => {
			AWSMock.setSDK('aws-sdk');
			AWSMock.mock('SNS', 'publish', 'message');
			const sns = new AWS.SNS();
			sns.publish({} as any, function(err, data) {
				expect(data).toEqual('message');
				done();
			});
		});

		it('Modules with multi-parameter constructors can be set for mocking', done => {
			AWSMock.setSDK('aws-sdk');
			AWSMock.mock(
				'CloudFront.Signer',
				'getSignedUrl',
				async () => 'test'
			);
			const signer = new AWS.CloudFront.Signer(
				'key-pair-id',
				'private-key'
			);
			signer.getSignedUrl({} as any, (err, data) => {
				expect(data).toEqual('test');
				done();
			});
		});

		it('Setting the aws-sdk to the wrong module can cause an exception when mocking', () => {
			AWSMock.setSDK('stream');
			expect(function() {
				AWSMock.mock('SNS', 'publish', 'message');
			}).toThrow();
			AWSMock.setSDK('aws-sdk');
		});
	});

	describe('AWS.setSDKInstance function should mock a specific AWS module', () => {
		it('Specific Modules can be set for mocking', done => {
			const aws2 = require('aws-sdk');
			AWSMock.setSDKInstance(aws2);
			AWSMock.mock('SNS', 'publish', 'message2');
			const sns = new AWS.SNS();
			sns.publish({} as any, function(err, data) {
				expect(data).toEqual('message2');
				done();
			});
		});

		it('Setting the aws-sdk to the wrong instance can cause an exception when mocking', () => {
			const bad = {};
			AWSMock.setSDKInstance(bad);
			expect(function() {
				AWSMock.mock('SNS', 'publish', 'message');
			}).toThrow();
			AWSMock.setSDKInstance(AWS);
		});
	});
});

function isStream(stream) {
	return (
		stream !== null &&
		typeof stream === 'object' &&
		typeof stream.pipe === 'function'
	);
}
