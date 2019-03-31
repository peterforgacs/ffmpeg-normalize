'use strict';
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
    }
    return t;
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) if (e.indexOf(p[i]) < 0)
            t[p[i]] = s[p[i]];
    return t;
};
exports.__esModule = true;
var ffmpeg_static_1 = require("ffmpeg-static");
var child = require("child_process");
var Logger = /** @class */ (function () {
    function Logger() {
    }
    Logger.prototype.setVerbosity = function (isVerbose) {
        this.isVerbose = isVerbose;
    };
    Logger.prototype.log = function () {
        var rest = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            rest[_i] = arguments[_i];
        }
        if (this.isVerbose) {
            console.log.apply(console, rest);
        }
    };
    Logger.prototype.error = function () {
        var rest = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            rest[_i] = arguments[_i];
        }
        if (this.isVerbose) {
            console.error(rest);
        }
    };
    return Logger;
}());
var logger = new Logger();
var NormalizationSetting = /** @class */ (function () {
    function NormalizationSetting(_a) {
        var base = _a.base, min = _a.min, max = _a.max;
        this.min = min;
        this.max = max;
        this.base = base;
    }
    NormalizationSetting.prototype.isValid = function (value) {
        return value >= this.min && value <= this.max;
    };
    return NormalizationSetting;
}());
var Validator = /** @class */ (function () {
    function Validator() {
    }
    Validator.prototype.validate = function (_a) {
        var name = _a.name, value = _a.value;
        if (this[name]) {
            if (this[name].isValid(Number(value))) {
                logger.log("Loudness parameter validator:: " + name + " is in range.");
                return Number(value);
            }
            else {
                logger.log("Loudness parameter validator:: " + name + " is not in range setting default " + this[name].base + ".");
                return this[name].base;
            }
        }
        else {
            logger.log("Loudness parameter validator:: " + name + " is not defined in current normalization method.");
            return null;
        }
    };
    return Validator;
}());
var EbuValidator = /** @class */ (function (_super) {
    __extends(EbuValidator, _super);
    function EbuValidator() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.input_i = new NormalizationSetting({
            base: -23,
            min: -70.0,
            max: -5.0
        });
        _this.input_lra = new NormalizationSetting({
            base: 7.0,
            min: 1.0,
            max: 20.0
        });
        _this.input_tp = new NormalizationSetting({
            base: -2.0,
            min: -9.0,
            max: 0.0
        });
        return _this;
    }
    return EbuValidator;
}(Validator));
var PeakValidator = /** @class */ (function (_super) {
    __extends(PeakValidator, _super);
    function PeakValidator() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.input_i = new NormalizationSetting({
            base: -23,
            min: -99,
            max: 0
        });
        return _this;
    }
    return PeakValidator;
}(Validator));
var RmsValidator = /** @class */ (function (_super) {
    __extends(RmsValidator, _super);
    function RmsValidator() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return RmsValidator;
}(PeakValidator));
;
var Loudness = /** @class */ (function () {
    function Loudness(_a, validator) {
        var input_i = _a.input_i, input_lra = _a.input_lra, input_tp = _a.input_tp, input_thresh = _a.input_thresh, target_offset = _a.target_offset;
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
    return Loudness;
}());
var LoudnessFactory = /** @class */ (function () {
    function LoudnessFactory() {
    }
    LoudnessFactory.build = function (_a) {
        var normalization = _a.normalization, target = _a.target;
        var validator = LoudnessFactory.buildValidator(normalization);
        var loudness = new Loudness(target, validator);
        return loudness;
    };
    LoudnessFactory.buildValidator = function (normalization) {
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
    };
    return LoudnessFactory;
}());
var CommandFactory = /** @class */ (function () {
    function CommandFactory() {
    }
    CommandFactory.measure = function (_a) {
        var input = _a.input, loudness = _a.loudness, rest = __rest(_a, ["input", "loudness"]);
        var command = ffmpeg_static_1.path + " -hide_banner ";
        command += "-i " + input + " ";
        command += "-af loudnorm=";
        command += "I=" + loudness.input_i + ":";
        command += "LRA=" + loudness.input_lra + ":";
        command += "tp=" + loudness.input_tp + ":";
        command += 'print_format=json -f null -';
        return new Command({
            text: command,
            processAfter: function (_a) {
                var stderr = _a.stderr;
                return Parser.getMeasurements(stderr);
            }
        });
    };
    CommandFactory.change = function (_a) {
        var input = _a.input, output = _a.output, loudness = _a.loudness, measured = _a.measured;
        var command = ffmpeg_static_1.path + " -hide_banner ";
        command += "-i " + input + " ";
        command += "-af loudnorm=";
        command += "I=" + loudness.input_i + ":";
        if (loudness.input_lra) {
            command += "LRA=" + loudness.input_lra + ":";
        }
        if (loudness.input_tp) {
            command += "tp=" + loudness.input_tp + ":";
        }
        if (measured) {
            command += "measured_I=" + measured.input_i + ":";
            command += "measured_LRA=" + measured.input_lra + ":";
            command += "measured_tp=" + measured.input_tp + ":";
            command += "measured_thresh=" + measured.input_thresh + ":";
            command += "offset=" + measured.target_offset + " ";
        }
        else {
            command += " ";
        }
        command += "-ar 48k -y ";
        command += "" + output;
        return new Command({
            text: command,
            processAfter: function () { }
        });
    };
    return CommandFactory;
}());
var Command = /** @class */ (function () {
    function Command(_a) {
        var text = _a.text, processAfter = _a.processAfter;
        this.state = 'initalized';
        this.text = text;
        this.processAfter = processAfter;
    }
    Command.prototype.execute = function (_a) {
        var _this = this;
        var success = _a.success, fail = _a.fail;
        this.state = 'progress';
        logger.log('Executing: ', this.text);
        child.exec(this.text, function (error, stdout, stderr) {
            _this.state = 'finished';
            _this.error = error;
            _this.stderr = stderr;
            _this.stdout = stdout;
            logger.log(stdout, stderr);
            if (_this.error) {
                return fail(_this);
            }
            else if (_this.processAfter) {
                _this.processed = _this.processAfter(_this);
            }
            return success(_this);
        });
    };
    return Command;
}());
var Normalizer = /** @class */ (function () {
    function Normalizer() {
    }
    Normalizer.validate = function (_a) {
        var input = _a.input, output = _a.output, loudness = _a.loudness, rest = __rest(_a, ["input", "output", "loudness"]);
        loudness = LoudnessFactory.build(loudness);
        return __assign({ input: input,
            output: output,
            loudness: loudness }, rest);
    };
    Normalizer.measure = function (_a) {
        var input = _a.input, output = _a.output, loudness = _a.loudness, rest = __rest(_a, ["input", "output", "loudness"]);
        return new Promise(function (resolve, reject) {
            var command = CommandFactory.measure({ input: input, output: output, loudness: loudness });
            command.execute({
                success: function (_a) {
                    var stdout = _a.stdout, stderr = _a.stderr, processed = _a.processed;
                    if (stderr) {
                        logger.error(stderr);
                    }
                    return resolve(__assign({ input: input,
                        output: output,
                        loudness: loudness, measured: new Loudness(processed) }, rest));
                },
                fail: function (error) {
                    if (error) {
                        logger.error(error);
                        return resolve(__assign({ input: input,
                            output: output,
                            loudness: loudness, measured: null }, rest));
                    }
                }
            });
        });
    };
    Normalizer.change = function (_a) {
        var input = _a.input, output = _a.output, loudness = _a.loudness, measured = _a.measured, rest = __rest(_a, ["input", "output", "loudness", "measured"]);
        return new Promise(function (resolve, reject) {
            var command = CommandFactory.change({ input: input, output: output, loudness: loudness, measured: measured });
            command.execute({
                success: function (_a) {
                    var stdout = _a.stdout, stderr = _a.stderr;
                    return resolve({
                        normalized: true,
                        info: __assign({ input: input,
                            output: output,
                            loudness: loudness,
                            measured: measured }, rest)
                    });
                },
                fail: function (error) {
                    return reject({
                        normalized: false,
                        error: error,
                        info: __assign({ input: input,
                            output: output,
                            loudness: loudness,
                            measured: measured }, rest)
                    });
                }
            });
        });
    };
    return Normalizer;
}());
;
var Parser = /** @class */ (function () {
    function Parser() {
    }
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
    Parser.getMeasurements = function (stdout) {
        try {
            var data = stdout.trim().split('\n');
            var parsed = "";
            for (var i = data.length - 12; i < data.length; ++i) {
                var line = data[i].trim().replace('/\t/g', '');
                parsed += line;
            }
            var measurements = JSON.parse(parsed);
            return measurements;
        }
        catch (error) {
            logger.error(error);
            return null;
        }
        ;
    };
    return Parser;
}());
module.exports.normalize = function (input) {
    var validated = Normalizer.validate(input);
    var normalization = input.loudness.normalization || 'ebuR128';
    logger.setVerbosity(input.verbose || false);
    switch (normalization) {
        case 'ebuR128':
            return Normalizer.measure(validated)
                .then(function (measured) {
                return Normalizer.change(measured);
            });
        case 'rms':
        case 'peak':
            return Normalizer.change(validated);
        default:
            throw new Error('Failed audio normalization.');
    }
};
