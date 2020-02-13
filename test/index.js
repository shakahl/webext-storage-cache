import test from 'ava';
import sinon from 'sinon';
import './_fixtures.js';
import cache from '../index.js';

const getUsernameDemo = async name => name.slice(1).toUpperCase();

function createCache(daysFromToday, wholeCache) {
	for (const [key, data] of Object.entries(wholeCache)) {
		chrome.storage.local.get
			.withArgs(key)
			.yields({[key]: {
				data,
				expiration: Date.now() + (daysFromToday * 1000 * 60 * 60 * 24)
			}});
	}
}

test.beforeEach(() => {
	chrome.flush();
	chrome.storage.local.get.yields({});
	chrome.storage.local.set.yields(undefined);
	chrome.storage.local.remove.yields(undefined);
});

test('get() with empty cache', async t => {
	t.is(await cache.get('name'), undefined);
});

test('get() with cache', async t => {
	createCache(10, {
		'cache:name': 'Rico'
	});
	t.is(await cache.get('name'), 'Rico');
});

test('get() with expired cache', async t => {
	createCache(-10, {
		'cache:name': 'Rico'
	});
	t.is(await cache.get('name'), undefined);
});

test('set() with undefined', async t => {
	await cache.set('name');
	// StorageArea.set should not be called with `undefined`
	t.is(chrome.storage.local.set.callCount, 0);
});

test.todo('set() with past expiration should throw');

test('set() with value', async t => {
	const expiration = 20;
	await cache.set('name', 'Anne', expiration);
	const arguments_ = chrome.storage.local.set.lastCall.args[0];
	t.deepEqual(Object.keys(arguments_), ['cache:name']);
	t.is(arguments_['cache:name'].data, 'Anne');
	t.true(arguments_['cache:name'].expiration < Date.now() + (1000 * 3600 * 24 * expiration));
});

test('function() with empty cache', async t => {
	const spy = sinon.spy(getUsernameDemo);
	const call = cache.function(spy);

	t.is(await call('@anne'), 'ANNE');

	t.is(chrome.storage.local.get.lastCall.args[0], 'cache:@anne');
	t.true(spy.withArgs('@anne').calledOnce);
	t.is(spy.callCount, 1);
	t.is(chrome.storage.local.set.lastCall.args[0]['cache:@anne'].data, 'ANNE');
});

test('function() with cache', async t => {
	createCache(10, {
		'cache:@anne': 'ANNE'
	});

	const spy = sinon.spy(getUsernameDemo);
	const call = cache.function(spy);

	t.is(await call('@anne'), 'ANNE');

	t.is(chrome.storage.local.get.lastCall.args[0], 'cache:@anne');
	t.is(chrome.storage.local.set.callCount, 0);
	t.is(spy.callCount, 0);
});

test('function() varies cache by function argument', async t => {
	createCache(10, {
		'cache:@anne': 'ANNE'
	});

	const spy = sinon.spy(getUsernameDemo);
	const call = cache.function(spy);

	t.is(await call('@anne'), 'ANNE');
	t.is(spy.callCount, 0);

	t.is(await call('@mari'), 'MARI');
	t.is(spy.callCount, 1);
});

test('function() ignores second argument by default', async t => {
	createCache(10, {
		'cache:@anne': 'ANNE'
	});

	const spy = sinon.spy(getUsernameDemo);
	const call = cache.function(spy);

	await call('@anne', 1);
	await call('@anne', 2);
	t.is(spy.callCount, 0);
});

test('function() accepts custom cache key generator', async t => {
	createCache(10, {
		'cache:@anne,1': 'ANNE,1'
	});

	const spy = sinon.spy(getUsernameDemo);
	const call = cache.function(spy, {
		cacheKey: arguments_ => arguments_.join()
	});

	await call('@anne', 1);
	t.is(spy.callCount, 0);

	await call('@anne', 2);
	t.is(spy.callCount, 1);

	t.is(chrome.storage.local.get.firstCall.args[0], 'cache:@anne,1');
	t.is(chrome.storage.local.get.lastCall.args[0], 'cache:@anne,2');
});

test('function() verifies cache with isExpired callback', async t => {
	createCache(10, {
		'cache:@anne': '@anne'
	});

	const spy = sinon.spy(getUsernameDemo);
	const call = cache.function(spy, {
		isExpired: value => value.startsWith('@')
	});

	t.is(await call('@anne'), 'ANNE');
	t.is(chrome.storage.local.get.lastCall.args[0], 'cache:@anne');
	t.is(chrome.storage.local.set.lastCall.args[0]['cache:@anne'].data, 'ANNE');
	t.is(spy.callCount, 1);
});