'use strict';
import ffmpeg = require('ffmpeg-static');
import * as child from 'child_process';

class NormalizationSetting
{
	public min : number;
	public max : number;
	public base : number;

	constructor({
		base,
		min,
		max
	})
	{
		this.min = min;
		this.max = max;
		this.base = base;
	}

	isValid({
		value
	})
	{
		return value >= this.min && value <= this.max;
	}
}

class Validator
{
	private type : string;
	public validate({
		name,
		value
	})
	{
		if (this[name])
		{
			if (this[name].isValid(Number(value)))
			{
				console.log(`Loudness parameter validator:: ${name} is in range.`);
				return Number(value);
			}
			else
			{
				console.log(`Loudness parameter validator:: ${name} is not in range setting default ${this[name].base}.`);
				return this[name].base;
			}
		}
		else
		{
			console.log(`Loudness parameter validator:: ${name} is not defined in current normalization method.`);
			return null;
		}
	}
}

class EbuValidator extends Validator
{
	input_i = new NormalizationSetting({
		base: -23,
		min: -70.0,
		max: -5.0
	});

	input_lra = new NormalizationSetting({
		base: 7.0,
		min: 1.0,
		max: 20.0
	});

	input_tp = new NormalizationSetting ({
		base: -2.0,
		min: -9.0,
		max: 0.0
	});
}

class PeakValidator extends Validator
{
	input_i = new NormalizationSetting({
		base: -23,
		min: -99,
		max: 0
	});
}

class RmsValidator extends PeakValidator {};

class Loudness
{
	public input_i: number;
	public input_lra?: number;
	public input_tp?: number;
	public input_thresh?: number;
	public target_offset?: number;

	constructor({
		input_i,
		input_lra,
		input_tp,
		input_thresh,
		target_offset
	},
		validator?
	)
	{
		if (validator)
		{
			this.input_i       = validator.validate({ name: 'input_i', value: input_i });
			this.input_lra     = validator.validate({ name: 'input_lra', value: input_lra });
			this.input_tp      = validator.validate({ name: 'input_tp', value: input_tp  });
			this.input_thresh  = validator.validate({ name: 'input_thresh', value: input_thresh });
			this.target_offset = validator.validate({ name: 'target_offset', value: target_offset });
		}
		else
		{
			this.input_i = Number(input_i);
			this.input_lra = Number(input_lra);
			this.input_tp = Number(input_tp);
			this.input_thresh = Number(input_thresh);
			this.target_offset = Number(target_offset);
		}
	}
}

class LoudnessFactory
{
	public static build({
		normalization,
		target
	})
	: Loudness
	{
		let validator = LoudnessFactory.buildValidator(normalization);
		let loudness = new Loudness(target, validator);
		return loudness;
	}

	public static buildValidator (normalization : string )
	{
		switch (normalization) {
			case 'ebu128':
				return new EbuValidator();
			case 'peak':
				return new PeakValidator();
			case 'rms':
				return new RmsValidator();
			default:
				throw new Error('Unsupported normalization type.');
		}
	}
}

class CommandFactory
{
	static measure({
		input,
		loudness,
		...rest
	})
	{
		let command = `${ffmpeg.path} -hide_banner `;
		command +=  `-i ${input} `;
		command += `-af loudnorm=`;
		command += `I=${loudness.input_i}:`;
		command += `LRA=${loudness.input_lra}:`;
		command += `tp=${loudness.input_tp}:`;
		command += 'print_format=json -f null -';

		return new Command({
			text: command,
			processAfter: ({ stderr }) => {
				return Parser.getMeasurements(stderr);
			}
		});
	}

	static change({
		input,
		output,
		loudness,
		measured
	})
	{
		let command = `${ffmpeg.path} -hide_banner `;
		command +=  `-i ${input} `;
		command += `-af loudnorm=`;
		command += `I=${loudness.input_i}:`;
		command += `LRA=${loudness.input_lra}:`;
		command += `tp=${loudness.input_tp}:`;
		if (measured){
			command += `measured_I=${measured.input_i}:`;
			command += `measured_LRA=${measured.input_lra}:`;
			command += `measured_tp=${measured.input_tp}:`;
			command += `measured_thresh=${measured.input_thresh}:`;
			command += `offset=${measured.target_offset} `;
		} else
		{
			command += " ";
		}
		command += `-ar 48k -y `;
		command += `${output}`;

		return new Command({
			text: command,
			processAfter: () => {}
		});
	}
}

class Command
{
	private text   : string;
	public error?  : Error;
	public stderr? : string;
	public stdout? : string;
	public state ? : string;
	public processed? : any;
	public processBefore? : any;
	public processAfter? : any;

	constructor({
		text,
		processAfter
	})
	{
		this.state = 'initalized';
		this.text = text;
		this.processAfter = processAfter;
	}

	execute({
		success,
		fail
	}){
		this.state = 'progress';
		console.log('Executing: ', this.text);

		child.exec(this.text, (error, stdout, stderr) =>
		{
			this.state = 'finished';
			this.error = error;
			this.stderr = stderr;
			this.stdout = stdout;

			console.log(stdout, stderr);

			if (this.error)
			{
				return fail(this);
			}
			else if (this.processAfter)
			{
				this.processed = this.processAfter(this);
			}

			return success(this);
		});
	}
}

class Normalizer
{
	public static validate(
	{
		input,
		output,
		loudness,
		...rest
	}
	)
	{
		loudness = LoudnessFactory.build(loudness);
		return {
			input,
			output,
			loudness,
			...rest
		}
	}

	public static measure (
	{
		input,
		output,
		loudness,
		...rest
	})
	{
		return new Promise((resolve, reject) => {
			let command = CommandFactory.measure({ input, output, loudness });
			command.execute({
				success: ({ stdout, stderr, processed}) => {
					console.log(stderr);
					return resolve({
						input,
						output,
						loudness,
						measured: new Loudness(processed),
						...rest
					});
				},

				fail: error => {
					if (error){
						return resolve({
							input,
							output,
							loudness,
							measured: null,
							...rest
						});
					}
				}
			});
		});
	}

	public static change (
		{
			input,
			output,
			loudness,
			measured,
			...rest
		})
		{
			return new Promise((resolve, reject) => {
				let command = CommandFactory.change({ input, output, loudness, measured });
				command.execute({
					success: ({ stdout, stderr}) => {
						console.log('Change success')
						return resolve({
							normalized: true,
							info: {
								input,
								output,
								loudness,
								measured,
								...rest
							}
						});
					},

					fail: error => {
						console.log('Change failed');
						return reject({
							normalized: false,
							error: error,
							info: {
								input,
								output,
								loudness,
								measured,
								...rest
							}
						});
					}
				});
			});
		}
};

class Parser {
	/**
	 * @summary Parse the last 12 line of ffmpeg measure output.
	 * @param {string} stdout - Output from the measure command.
	 * @returns {JSON}
		{
		"input_i" : "-25.05",
		"input_tp" : "-4.90",
		"input_lra" : "1.80",
		"input_thresh" : "-35.24",
		"output_i" : "-25.02",
		"output_tp" : "-5.12",
		"output_lra" : "1.50",
		"output_thresh" : "-35.13",
		"normalization_type" : "dynamic",
		"target_offset" : "0.02"
	}*/
	public static getMeasurements(stdout : string)
	{
		try {
			let data = stdout.trim().split('\n');
			let parsed = "";

			for (let i = data.length - 12 ; i < data.length ; ++i){
				let line = data[i].trim().replace('/\t/g', '');
				parsed += line;
			}

			let measurements = JSON.parse(parsed);
			return measurements;
		} catch (error){
			console.error(error);
			return null;
		};
	}
}

/*
let input = {
	input: 'sample_original.mp4',
	output: 'sample_normalized.mp4',
	loudness: {
		normalization: 'ebu128',
		target: {
			input_i: 1,
			input_lra: 2,
			input_tp: 3,
			input_thresh: 4,
			target_offset: 5
		}
	}
};
*/

module.exports.normalize = input => {
	let validated = Normalizer.validate(input);
	console.log(validated);
	Normalizer.measure(validated)
	.then( measured => {
		console.log('MEASURED', measured);
		return Normalizer.change(measured);
	})
	.then(changed => {
		console.log('CHANGED', changed);
		return changed;
	})
	.catch(error => {
		console.error(error);
	});
};
