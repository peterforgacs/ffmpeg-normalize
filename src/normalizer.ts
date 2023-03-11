'use strict';
import { ffprobePath as ffprobe_path, ffmpegPath as ffmpeg_path  } from 'ffmpeg-ffprobe-static';
import * as child from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface ChildProcessSuccessMessage {
	stdout: string,
	stderr: string,
	processed: any
}

interface ChildProcessFailMessage {
	stderr: string
}

class Logger {
	isVerbose: boolean;

	setVerbosity(isVerbose: boolean) {
		this.isVerbose = isVerbose;
	}
	log(...rest : any) {
		if (this.isVerbose) {
			console.log(...rest);
		}
	}
	error(...rest : any) {
		if (this.isVerbose) {
			console.error(rest);
		}
	}
}

const logger = new Logger();

class NormalizationSetting {
	public min: number;
	public max: number;
	public base: number;

	constructor(
		{
			base,
			min,
			max
		}
			:
			{
				base: number,
				min: number,
				max: number
			}) {
		this.min = min;
		this.max = max;
		this.base = base;
	}

	isValid(value: number) {
		return value >= this.min && value <= this.max;
	}
}

class Validator {
	private type: string;
	public validate(
		{
			name,
			value
		}
			:
			{
				name: string,
				value: any
			}) {
		if (this[name]) {
			if (this[name].isValid(Number(value))) {
				logger.log(`Loudness parameter validator:: ${name} is in range.`);
				return Number(value);
			}
			else {
				logger.log(`Loudness parameter validator:: ${name} is not in range setting default ${this[name].base}.`);
				return this[name].base;
			}
		}
		else {
			logger.log(`Loudness parameter validator:: ${name} is not defined in current normalization method.`);
			return null;
		}
	}
}

class EbuValidator extends Validator {
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

	input_tp = new NormalizationSetting({
		base: -2.0,
		min: -9.0,
		max: 0.0
	});
}

class PeakValidator extends Validator {
	input_i = new NormalizationSetting({
		base: -23,
		min: -99,
		max: 0
	});
}

class RmsValidator extends PeakValidator { };

class Loudness {
	public input_i: number;
	public input_lra?: number;
	public input_tp?: number;
	public input_thresh?: number;
	public target_offset?: number;

	constructor(
		{
			input_i,
			input_lra,
			input_tp,
			input_thresh,
			target_offset
		}: {
			input_i: number,
			input_lra: number,
			input_tp: number,
			input_thresh: number,
			target_offset: number
		},
		validator?: Validator
	) {
		if (validator) {
			this.input_i = validator.validate({ name: 'input_i', value: input_i });
			this.input_lra = validator.validate({ name: 'input_lra', value: input_lra });
			this.input_tp = validator.validate({ name: 'input_tp', value: input_tp });
			this.input_thresh = validator.validate({ name: 'input_thresh', value: input_thresh });
			this.target_offset = validator.validate({ name: 'target_offset', value: target_offset });
		}
		else {
			this.input_i = Number(input_i);
			this.input_lra = Number(input_lra);
			this.input_tp = Number(input_tp);
			this.input_thresh = Number(input_thresh);
			this.target_offset = Number(target_offset);
		}
	}
}

class LoudnessFactory {
	public static build({
		normalization,
		target
	}): Loudness {
		let validator = LoudnessFactory.buildValidator(normalization);
		let loudness = new Loudness(target, validator);
		return loudness;
	}

	public static buildValidator(normalization: string) {
		switch (normalization) {
			case 'ebuR128':
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

class CommandFactory {
	static measure({
		input,
		loudness,
		...rest
	}) {
		let command = `${ffmpeg_path} -hide_banner `;
		command += `-i "${input}" `;
		command += `-af loudnorm=`;
		command += `I=${loudness.input_i}:`;
		command += `LRA=${loudness.input_lra}:`;
		command += `tp=${loudness.input_tp}:`;
		command += 'print_format=json -f null -';

		return new Command({
			text: command,
			processAfter: ({ stderr }: ChildProcessFailMessage) => {
				return Parser.getMeasurements(stderr);
			}
		});
	}

	static change({
		input,
		output,
		loudness,
		measured
	}) {
		let command = `${ffmpeg_path} -hide_banner `;
		command += `-i "${input}" `;
		command += `-af loudnorm=`;
		command += `I=${loudness.input_i}:`;
		if (loudness.input_lra) {
			command += `LRA=${loudness.input_lra}:`;
		}
		if (loudness.input_tp) {
			command += `tp=${loudness.input_tp}:`;
		}
		if (measured) {
			command += `measured_I=${measured.input_i}:`;
			command += `measured_LRA=${measured.input_lra}:`;
			command += `measured_tp=${measured.input_tp}:`;
			command += `measured_thresh=${measured.input_thresh}:`;
			command += `offset=${measured.target_offset} `;
		}
		else {
			command += " ";
		}
		command += `-ar 48k -y `;
		command += `"${output}"`;

		return new Command({
			text: command,
			processAfter: () => { }
		});
	}

	static getDuration(input: any) {
		const command = `${ffmpeg_path} -hide_banner -i "${input}" -f null -`;
		return new Command({
			text: command,
			processAfter: ({ stderr }: ChildProcessFailMessage) => {
				return Parser.getDuration(stderr);
			}
		});
	}

	static addPadding(input: any, output: any) {
		const command = `${ffmpeg_path} -hide_banner -i "${input}" -af apad,atrim=0:3 -y "${output}"`;
		return new Command({
			text: command,
			processAfter: () => { }
		});
	}

	static removePadding(input: any, output: any, duration: any, temporaryFile: string) {
		const command = `${ffmpeg_path} -hide_banner -i "${input}" -af apad,atrim=0:${duration} -y "${output}"`;
		return new Command({
			text: command,
			processAfter: () => {
				fs.unlinkSync(temporaryFile);
			}
		});
	}
}

class Command {
	private text: string;
	public error?: Error;
	public stderr?: string;
	public stdout?: string;
	public state?: string;
	public processed?: any;
	public processBefore?: any;
	public processAfter?: any;

	constructor(
		{
			text,
			processAfter
		}
			:
			{
				text: string,
				processAfter?: Function
			}) {
		this.state = 'initalized';
		this.text = text;
		this.processAfter = processAfter;
	}

	execute(
		{
			success,
			fail
		}
			:
			{
				success: Function,
				fail: Function
			}) {
		this.state = 'progress';
		logger.log('Executing: ', this.text);

		child.exec(this.text, (error, stdout, stderr) => {
			this.state = 'finished';
			this.error = error;
			this.stderr = stderr;
			this.stdout = stdout;

			logger.log(stdout, stderr);

			if (this.error) {
				return fail(this);
			}
			else if (this.processAfter) {
				this.processed = this.processAfter(this);
			}

			return success(this);
		});
	}
}

class Normalizer {
	public static validate(
		{
			input,
			output,
			loudness,
			...rest
		}
	) {
		return new Promise((resolve, reject) => {
			loudness = LoudnessFactory.build(loudness);
			return this.fileHasAudio(input)
			.then((hasAudio) => {
				if (hasAudio){
					return resolve({
						input,
						output,
						loudness,
						...rest
					})
				}
				else {
					return reject(new Error(`No audio found on ${input}.`));
				}
			})
		})
	}

	private static fileHasAudio(input : string ) : Promise<boolean> {
		return new Promise( (resolve) => {
			try {
				let command = new Command({ text: `${ffprobe_path} -i "${input}" -show_streams -select_streams a -loglevel error` });
				command.execute({
					success: ({ stdout, stderr }: ChildProcessSuccessMessage) => {
						const numberOfAudioStreams = Parser.getNumberOfAudioStreams(stdout);
						return resolve(numberOfAudioStreams > 0);
					},
					fail: ({ stderr }: ChildProcessFailMessage) => {
						logger.error(stderr);
						return resolve(false);
					}
				});
			} catch (error) {
				logger.error(error);
				return resolve(false);
			}

		});
	}

	private static addPadding({ input, output, originalDuration, ...rest }, resolve, reject) {

		const basename = path.basename(output);
		const tempOutput = path.join(path.dirname(output), '__temporary.' + basename);

		let command = CommandFactory.addPadding(input, tempOutput);
		command.execute({
			success: ({ stdout, stderr, processed }: ChildProcessSuccessMessage) => {
				if (stderr) {
					logger.error(stderr);
				}

				return resolve({
					input: tempOutput, // Use padded file
					output: output,
					padded: true,
					originalDuration,
					temporaryFile: tempOutput,
					...rest
				});
			},

			fail: reject
		});
	}

	private static removePadding({ input, output, originalDuration, temporaryFile, ...rest }, resolve, reject) {
		let command = CommandFactory.removePadding(input, output, originalDuration, temporaryFile);
		command.execute({
			success: ({ stdout, stderr, processed }: ChildProcessSuccessMessage) => {
				if (stderr) {
					logger.error(stderr);
				}

				return resolve({
					input: input,
					output: output,
					originalDuration,
					...rest
				});
			},

			fail: reject
		});
	}

	public static pad({ input, ...rest }) {
		return new Promise((resolve, reject) => {
			let command = CommandFactory.getDuration(input);
			command.execute({
				success: ({ stdout, stderr, processed }: ChildProcessSuccessMessage) => {
					if (stderr) {
						logger.error(stderr);
					}

					if (processed < 3) {
						Normalizer.addPadding({ input, originalDuration: processed, ...rest } as any, resolve, reject);
					} else {
						return resolve({
							input,
							...rest
						});
					}
				},

				fail: reject
			});
		});
	}

	public static measure(
		{
			input,
			output,
			loudness,
			...rest
		}) {
		return new Promise((resolve, reject) => {
			let command = CommandFactory.measure({ input, output, loudness });
			command.execute({
				success: ({ stdout, stderr, processed }: ChildProcessSuccessMessage) => {
					if (stderr) {
						logger.error(stderr);
					}
					return resolve({
						input,
						output,
						loudness,
						measured: new Loudness(processed),
						...rest
					});
				},

				fail: (error: ChildProcessFailMessage) => {
					if (error) {
						logger.error(error);
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

	public static change(
		{
			input,
			output,
			loudness,
			measured,
			padded,
			...rest
		}) {
		return new Promise((resolve, reject) => {
			let command = CommandFactory.change({ input, output, loudness, measured });
			command.execute({
				success: ({ stdout, stderr }: { stdout: string, stderr: string }) => {

					if (padded) {
						Normalizer.removePadding({ input, output, loudness, measured, padded, ...rest } as any, resolve, reject);
					} else {
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
					}


				},

				fail: (error: string) => {
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
	public static getMeasurements(stdout: string) {
		try {
			let data = stdout.trim().split('\n');
			let parsed = "";

			for (let i = data.length - 12; i < data.length; ++i) {
				let line = data[i].trim().replace('/\t/g', '');
				parsed += line;
			}

			let measurements = JSON.parse(parsed);
			return measurements;
		} catch (error) {
			logger.error(error);
			return null;
		};
	}

	/**
	 * @summary Parse the ffmpeg output to extract the duration of a file.
	 * @param {string} stdout - Output from the command
	 * @returns Duration in seconds
	 */
	static getDuration(stdout: string): number {
		try {
			const durationRegex = /Duration:\s+(\d\d):(\d\d):(\d\d.\d+)/;
			const match = durationRegex.exec(stdout);
			if (match) {
				return 3600 * Number(match[1]) + 60 * Number(match[2]) + Number(match[3]);
			}
			logger.error('Did not find duration');
		} catch (error) {
			logger.error(error);
			return null;
		}
	}

	/**
	 * @summary Parses ffprobe output to check if the media file has audio streams.
	 * @param {string} stdout
	 * @returns {number} number of audio streams
	 */
	static getNumberOfAudioStreams(stdout: string): number {
		const matches = stdout.match(/\/STREAM/g);
		return matches ? matches.length : 0;
	}
}

module.exports.normalize = input => {
	return new Promise((resolve, reject) => {
		logger.setVerbosity(input.verbose || false);
		const normalization = input.loudness.normalization || 'ebuR128';
		return Normalizer.validate(input)
		.then(validated => Normalizer.pad(validated as any))
		.then(paddedInput => {
			switch (normalization) {
				case 'ebuR128':
					return Normalizer.measure(paddedInput as any)
						.then(measured => {
							return resolve(Normalizer.change(measured as any));
						});
				case 'rms':
				case 'peak':
					return resolve(Normalizer.change(paddedInput as any));
				default:
					throw new Error('Not supported normalization type.');
			}
		})
		.catch(error => {
			logger.error(error);
			return reject({
				normalized: false,
				error: error.message ? error.message : error,
				...input
			})
		})
	});
};