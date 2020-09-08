const { pathsToModuleNameMapper } = require('ts-jest/utils');
const { compilerOptions } = require('./tsconfig');

module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['<rootDir>/src/**/*.spec.ts'],
	moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
		prefix: '<rootDir>/src/',
	}),
};
