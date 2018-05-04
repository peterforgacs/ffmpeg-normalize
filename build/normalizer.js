define("normalizer", ["require", "exports", "ffmpeg-static", "child_process"], function (require, exports, ffmpeg, child) {
    'use strict';
    Object.defineProperty(exports, "__esModule", { value: true });
    class NormalizationSetting {
        constructor({ base, min, max }) {
            this.min = min;
            this.max = max;
            this.base = base;
        }
        isValid({ value }) {
            return value >= this.min && value <= this.max;
        }
    }
    class Validator {
        validate({ name, value }) {
            if (this[name]) {
                if (this[name].isValid(Number(value))) {
                    console.log(`Loudness parameter validator:: ${name} is in range.`);
                    return Number(value);
                }
                else {
                    console.log(`Loudness parameter validator:: ${name} is not in range setting default ${this[name].base}.`);
                    return this[name].base;
                }
            }
            else {
                console.log(`Loudness parameter validator:: ${name} is not defined in current normalization method.`);
                return null;
            }
        }
    }
    class EbuValidator extends Validator {
        constructor() {
            super(...arguments);
            this.input_i = new NormalizationSetting({
                base: -23,
                min: -70.0,
                max: -5.0
            });
            this.input_lra = new NormalizationSetting({
                base: 7.0,
                min: 1.0,
                max: 20.0
            });
            this.input_tp = new NormalizationSetting({
                base: -2.0,
                min: -9.0,
                max: 0.0
            });
        }
    }
    class PeakValidator extends Validator {
        constructor() {
            super(...arguments);
            this.input_i = new NormalizationSetting({
                base: -23,
                min: -99,
                max: 0
            });
        }
    }
    class RmsValidator extends PeakValidator {
    }
    ;
    class Loudness {
        constructor({ input_i, input_lra, input_tp, input_thresh, target_offset }, validator) {
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
        static build({ normalization, target }) {
            let validator = LoudnessFactory.buildValidator(normalization);
            let loudness = new Loudness(target, validator);
            return loudness;
        }
        static buildValidator(normalization) {
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
    class CommandFactory {
        static measure({ input, loudness, ...rest }) {
            let command = `${ffmpeg.path} -hide_banner `;
            command += `-i ${input} `;
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
        static change({ input, output, loudness, measured }) {
            let command = `${ffmpeg.path} -hide_banner `;
            command += `-i ${input} `;
            command += `-af loudnorm=`;
            command += `I=${loudness.input_i}:`;
            command += `LRA=${loudness.input_lra}:`;
            command += `tp=${loudness.input_tp}:`;
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
            command += `${output}`;
            return new Command({
                text: command,
                processAfter: () => { }
            });
        }
    }
    class Command {
        constructor({ text, processAfter }) {
            this.state = 'initalized';
            this.text = text;
            this.processAfter = processAfter;
        }
        execute({ success, fail }) {
            this.state = 'progress';
            console.log('Executing: ', this.text);
            child.exec(this.text, (error, stdout, stderr) => {
                this.state = 'finished';
                this.error = error;
                this.stderr = stderr;
                this.stdout = stdout;
                console.log(stdout, stderr);
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
        static validate({ input, output, loudness, ...rest }) {
            loudness = LoudnessFactory.build(loudness);
            return {
                input,
                output,
                loudness,
                ...rest
            };
        }
        static measure({ input, output, loudness, ...rest }) {
            return new Promise((resolve, reject) => {
                let command = CommandFactory.measure({ input, output, loudness });
                command.execute({
                    success: ({ stdout, stderr, processed }) => {
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
                        if (error) {
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
        static change({ input, output, loudness, measured, ...rest }) {
            return new Promise((resolve, reject) => {
                let command = CommandFactory.change({ input, output, loudness, measured });
                command.execute({
                    success: ({ stdout, stderr }) => {
                        console.log('Change success');
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
    }
    ;
    class Parser {
        static getMeasurements(stdout) {
            try {
                let data = stdout.trim().split('\n');
                let parsed = "";
                for (let i = data.length - 12; i < data.length; ++i) {
                    let line = data[i].trim().replace('/\t/g', '');
                    parsed += line;
                }
                let measurements = JSON.parse(parsed);
                return measurements;
            }
            catch (error) {
                console.error(error);
                return null;
            }
            ;
        }
    }
    module.exports.normalize = input => {
        let validated = Normalizer.validate(input);
        console.log(validated);
        Normalizer.measure(validated)
            .then(measured => {
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
});
//# sourceMappingURL=normalizer.js.map