'use strict';
import test from 'ava';
const normalize = require('../index');

test('normalize ebu R128', t => {
	return normalize({
		input: __dirname + '/sample.mp4',
		output: __dirname + '/sample.processed.mp4',
		loudness: {
			normalization: 'ebuR128',
			target:
			{
				input_i: -23,
				input_lra: 7.0,
				input_tp: -2.0
			}
		},
		verbose: true
	})
	.then( normalized => {
		if (!normalized){
			t.fail('Not normalized.');
		} else {
			console.log(normalized)
			t.pass();
		}
	})
});