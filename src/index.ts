import AWS from 'aws-sdk';
import get from 'lodash.get';
import { Readable } from 'stream';

let AWSInstance = AWS;

type MockMethod = {
	original?: Function;
	mock: jest.Mock;
};
type MockService = {
	client?: any;
	methods: Record<string, MockMethod>;
	invoked: boolean;
	mock?: jest.SpyInstance;
};
const serviceMap: Record<string, MockService> = {};

export function setSDK(path) {
	AWSInstance = require(path);
}

export function setSDKInstance(sdk) {
	AWSInstance = sdk;
}

export function mock(service: string, method: string, impl: any) {
	if (!serviceMap[service]) {
		mockService(service);
	}

	mockServiceMethod(service, method, impl);
	return serviceMap[service].methods[method];
}

function mockService(service: string) {
	const serviceParts = service.split('.');
	const originalConstructor: any = getService(service);
	const parent =
		serviceParts.length > 1
			? get(AWSInstance, serviceParts.slice(0, serviceParts.length - 1))
			: AWSInstance;
	const lastServicePart = serviceParts[serviceParts.length - 1];
	const mockConstructor = function(...args) {
		if (serviceMap[service].client) {
			return serviceMap[service].client;
		}
		serviceMap[service].client = new originalConstructor(...args);

		for (const method of Object.keys(serviceMap[service].methods)) {
			updateAWSServiceMethod(service, method);
		}

		return serviceMap[service].client;
	};

	const mock = jest
		.spyOn(parent, lastServicePart)
		.mockImplementation(mockConstructor);

	for (const key of Object.keys(originalConstructor || {})) {
		const property = originalConstructor[key];
		mock[key] =
			typeof property === 'function'
				? property.bind(originalConstructor)
				: property;
	}
	try {
		jest.doMock(`aws-sdk/clients/${service.toLowerCase()}`, () => {
			return mock;
		});
	} catch (e) {
		// module does not exist
	}
	serviceMap[service] = {
		methods: {},
		invoked: false,
		mock,
	};
}

function getService(service) {
	const serviceParts = service.split('.');
	return get(AWSInstance, serviceParts);
}

function mockServiceMethod(service: string, method: string, impl: any) {
	serviceMap[service].methods[method] = {
		mock: jest.fn().mockImplementation((...args) => {
			const client = serviceMap[service].client;
			let userArgs, userCallback;
			if (typeof args[(args.length || 1) - 1] === 'function') {
				userArgs = args.slice(0, -1);
				userCallback = args[(args.length || 1) - 1];
			} else {
				userArgs = args;
			}

			let promise,
				chains: any[] = [],
				storedResult,
				callbackCalled = false;

			function tryResolveFromStored() {
				if (storedResult) {
					if (typeof storedResult.then === 'function') {
						for (const chain of chains) {
							storedResult.then(chain.resolve, chain.reject);
						}
					} else if (storedResult.reject) {
						for (const chain of chains) {
							chain.reject(storedResult.reject);
						}
					} else {
						for (const chain of chains) {
							chain.resolve(storedResult.resolve);
						}
					}
					chains = [];
				}
			}

			const callback = function(err: Error | null, data: any = null) {
				callbackCalled = true;
				if (err) {
					storedResult = { reject: err };
				} else {
					storedResult = { resolve: data };
				}
				if (userCallback) {
					userCallback(err, data);
				}
				tryResolveFromStored();
			};

			const request = {
				promise: function() {
					const PromiseClass =
						AWSInstance.config.getPromisesDependency() || Promise;
					promise = new PromiseClass(function(resolve, reject) {
						chains.push({
							resolve,
							reject,
						});
					});
					tryResolveFromStored();
					return promise;
				},
				createReadStream: function() {
					if (impl instanceof Readable) {
						return impl;
					} else {
						const stream = new Readable();
						stream._read = function() {
							if (
								typeof impl === 'string' ||
								Buffer.isBuffer(impl)
							) {
								this.push(impl);
							}
							this.push(null);
						};
						return stream;
					}
				},
				on: none,
				send: none,
			};

			const config =
				client.config || client.options || AWSInstance.config;

			if (config.paramValidation) {
				try {
					const inputRules = (
						(client.api && client.api.operations[method]) ||
						client[method] ||
						{}
					).input;
					if (inputRules) {
						const params = userArgs[(userArgs.length || 1) - 1];
						new (AWSInstance as any).ParamValidator(
							(
								client.config || AWSInstance.config
							).paramValidation
						).validate(inputRules, params);
					}
				} catch (e) {
					callback(e, null);
					return request;
				}
			}

			if (typeof impl === 'function') {
				const result = impl(...userArgs, callback);
				if (result != null && typeof result.then === 'function') {
					storedResult = result;
					if (!callbackCalled) {
						storedResult.then(
							data => callback(null, data),
							err => callback(err)
						);
					}
				}
			} else {
				callback(null, impl);
			}

			return request;
		}),
	};

	updateAWSServiceMethod(service, method);
}

function updateAWSServiceMethod(service: string, method: string) {
	if (
		!serviceMap[service]?.client ||
		!serviceMap[service]?.methods[method]?.mock
	) {
		return;
	}
	const methodImpl = serviceMap[service].methods[method].mock;
	const originalClient = serviceMap[service].client;
	if (!serviceMap[service].methods[method].original) {
		serviceMap[service].methods[method].original = originalClient[
			method
		].bind(originalClient);
	}
	originalClient[method] = methodImpl;
}

export function restore(service = '', method = '') {
	if (!service) {
		restoreAllServices();
	} else {
		if (method) {
			restoreMethod(service, method);
		} else {
			restoreService(service);
		}
	}
}

/**
 * Restores all mocked service and their corresponding methods.
 */
function restoreAllServices() {
	for (const service of Object.keys(serviceMap)) {
		restoreService(service);
	}
}

/**
 * Restores a single mocked service and its corresponding methods.
 */
function restoreService(service) {
	if (serviceMap[service]) {
		restoreAllMethods(service);
		if (serviceMap[service].mock) {
			serviceMap[service].mock?.mockRestore();
		}
		delete serviceMap[service];
		try {
			jest.dontMock(`aws-sdk/clients/${service.toLowerCase()}`);
		} catch (e) {
			// module does not exist
		}
	}

}

/**
 * Restores all mocked methods on a service.
 */
function restoreAllMethods(service) {
	for (const method of Object.keys(serviceMap[service].methods)) {
		restoreMethod(service, method);
	}
}

/**
 * Restores a single mocked method on a service.
 */
function restoreMethod(service, method) {
	if (serviceMap[service]?.methods[method]) {
		if (
			serviceMap[service].methods[method].original &&
			serviceMap[service].client
		) {
			serviceMap[service].client[method] =
				serviceMap[service].methods[method].original;
		}
		delete serviceMap[service].methods[method];
	}
}

function none() {
	// do nothing
}
