/* global require */

/* eslint-disable no-console */

const changeCase = require('change-case');
const gulp = require('gulp');
const ejs = require('gulp-ejs');
const mergeStream = require('merge-stream');
const rename = require('gulp-rename');
const requireDir = require('require-dir');

const langOutputDir = 'lang/locales';
const localeResources = requireDir('lang/json');

const config = {
	dest: langOutputDir,
	localeFiles: Object.keys(localeResources).map((lang) => ({
		filename: lang,
		data: {
			lang,
			properLang: changeCase.camel(lang),
			resources: JSON.stringify(Object.assign({}, localeResources['en'], localeResources[lang]), null, '\t'),
		},
	}))
};

function createLocalizationFiles() {
	const options = {
		client: true,
		strict: true,
		root: 'lang/locales',
		localsName: 'data'
	};

	console.log('Creating localization files...');

	return mergeStream(config.localeFiles.map(({ filename, data }) =>
		gulp.src('lang/util/lang-resource.ejs')
			.pipe(ejs(data, options))
			.pipe(rename({
				basename: filename,
				extname: '.js'
			}))
			.pipe(gulp.dest(options.root)))
	);
}

gulp.task('localize', createLocalizationFiles);
