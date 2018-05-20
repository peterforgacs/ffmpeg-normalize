# ffmpeg-normalize [![Build Status](https://travis-ci.org/peterforgacs/ffmpeg-normalize.svg?branch=master)](https://travis-ci.org/peterforgacs/ffmpeg-normalize)

<p align="center">
  <a href="https://github.com/peterforgacs/ffmpeg-normalize">
    <img src="https://cdn.iconscout.com/public/images/icon/free/png-512/ffmpeg-logo-3c576f7243ee4577-512x512.png" alt="sympact" width="150"/>
  </a>
</p>

> 🎧 Standalone audio normalization with ffmpeg.

## Install

```
$ npm install ffmpeg-normalize
```


## Usage

### Ebu R128

```js
const { normalize } = require('ffmpeg-normalize');

normalize({
	input: 'input.mp4',
	output: 'output.mp4',
	loudness: {
		normalization: 'ebur128',
		target: 
		{
			input_i: -23,
			input_lra: 7.0,
			input_tp: -2.0
		}
	}
})
then(normalized  => {
	// Normalized
})
.catch(error => {
	// Some error happened
});
```

### RMS

```js
const { normalize } = require('ffmpeg-normalize');

normalize({
	input: 'input.mp4',
	output: 'output.mp4',
	loudness: 
	{
		normalization: 'rms',
		target:
		{
			input_i: -23
		}
	}
})
then(normalized => {
	// Normalized
})
.catch(error => {
	// Some error happened
});
```

# API

## normalize({ input, output, loudness })

Parameters:
* input
* output
* loudness

### input

Type: `string`  
Required: `true`

Path to the input file.

#### output

Type: `string`  
Required: `true`

Path to the output file.

### loudness

Type: `object`  
Required: `true`

Describes a target loudness.

## loudness normalization

Type: `string`  
Required: `true`  
Options: `ebuR128` || `rms` || `peak`   

The normalization method to use.
The ebu R128 normalization uses a two pass method to measure the original values of the input file.
The other normalization methods only need the input_i value set.


### loudness input_i

Type: `number`  
Required: `true`  

ebu R128 normalization  
Min: `-70.0`  
Max: `-5.0`  
Default: `-23`  

rms and peak normalization  
Min: `-99`  
Max: `0`  
Default: `-23`  

The normalization target level in dB/LUFS.

### loudness input_lra

Type: `number`  
Required: `false`  
Min: `1.0`  
Max: `20.0`  
Default: `7.0`  

Loudness range.  

### loudness input_tp

Type: `number`  
Required: `false`  
Min: `-9.0`  
Max: `0.0`  
Default: `-2.0`  

True peak.

## License

MIT © [Peter Forgacs](http://peterforgacs.github.io)
