# ffmpeg-normalize

<p align="center">
  <a href="https://github.com/peterforgacs/ffmpeg-normalize">
    <img src="https://upload.wikimedia.org/wikipedia/commons/7/76/FFmpeg_icon.svg" alt="sympact" width="150"/>
  </a>
</p>

> 🎧 Audio loudness normalization with ffmpeg.

## Install

```bash
npm install @dharmendrasha/ffmpeg-normalize
```

## Usage

### Ebu R128

```js
const normalize = require('@dharmendrasha/ffmpeg-normalize');

normalize({
    input: 'input.mp4',
    output: 'output.mp4',
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
.then(normalized  => {
    // Normalized
})
.catch(error => {
    // Some error happened
});
```

## API

### normalize({ input, output, loudness, verbose })

Parameters:

* input
* output
* loudness
* verbose

#### input

Type: `string`  
Required: `true`

Path to the input file.

#### output

Type: `string`  
Required: `true`

Path to the output file.

#### loudness

Type: `object`  
Required: `true`

Describes a target loudness.

#### verbose

Type: `boolean`  
Required: `false`  
Default: `false`

When true sends ffmpeg input to stdout.

### loudness normalization

Type: `string`  
Required: `true`  
Options: `ebuR128` (Experimental `rms` || `peak`   )

The normalization method to use.
The ebu R128 normalization uses a two pass method to measure the original values of the input file.
The other normalization methods only need the input_i value set.

#### loudness input_i

Type: `number`  
Required: `true`  

ebu R128 normalization  
Min: `-70.0`  
Max: `-5.0`  
Default: `-23`  

rms and peak normalization (Experimental)  
Min: `-99`  
Max: `0`  
Default: `-23`  

The normalization target level in dB/LUFS.

#### loudness input_lra

Type: `number`  
Required: `false`  
Min: `1.0`  
Max: `20.0`  
Default: `7.0`  

Loudness range.  

#### loudness input_tp

Type: `number`  
Required: `false`  
Min: `-9.0`  
Max: `0.0`  
Default: `-2.0`  

True peak.

## License

MIT © [Dharmendra Soni](https://github.com/dharmendrasha/)
