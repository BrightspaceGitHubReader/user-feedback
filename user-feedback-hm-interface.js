import { Actions, Classes, Rels } from 'd2l-hypermedia-constants/index';
import { d2lfetch } from 'd2l-fetch/src/index.js';
import SirenParse from 'siren-parser';
const RESPONSE_FREQUENCY_NEVER_RESHOW = -1;

export class HmInterface {
	constructor({
		feedbackApplication,
		feedbackType,
		feedbackDomainRoot,
		token,
		responseFrequency = RESPONSE_FREQUENCY_NEVER_RESHOW,
		optOutType = 'permanent',
	}) {
		this.feedbackApplication = feedbackApplication;
		this.feedbackType = feedbackType;
		this.feedbackDomainRoot = feedbackDomainRoot;
		this.token = token;
		this.responseFrequency = responseFrequency;
		this.optOutType = optOutType;
		this.setupPromise = this.setup();
	}

	checkForRequiredParams() {
		if (!this.feedbackApplication) {
			throw new Error('no feedbackApplication provided');
		}
		if (!this.feedbackType) {
			throw new Error('no feedbackType provided');
		}
		if (!this.feedbackDomainRoot) {
			throw new Error('no feedbackDomainRoot provided');
		}
		if (!this.token) {
			throw new Error('no token provided');
		}
	}

	async getApplicationsEntity() {
		const domainRootEntity = await this.makeCall(this.feedbackDomainRoot);
		const applicationsHref = domainRootEntity.getLinkByRel(Rels.Feedback.applications).href;
		this.applicationsEntity = await this.makeCall(applicationsHref);
	}

	async getApplicationEntity() {
		const applicationsSubEntities =
			this.applicationsEntity.getSubEntitiesByClass(Classes.feedback.feedbackApplication)
				.filter(x => x.title === this.feedbackApplication);
		if (!applicationsSubEntities || !applicationsSubEntities.length) {
			throw new Error(`can't find the ${this.feedbackApplication} application`);
		}
		const applicationLinkHref = applicationsSubEntities[0].href;
		this.applicationEntity = await this.makeCall(applicationLinkHref);
	}

	async getApplicationTypeEntity() {
		const applicationTypeEntities = this.applicationEntity.getSubEntitiesByClass(Classes.feedback.feedbackType)
			.filter(x => x.title === this.feedbackType);
		if (!applicationTypeEntities || !applicationTypeEntities.length) {
			throw new Error(`can't find the ${this.feedbackType} type`);
		}
		this.applicationTypeEntity = await this.makeCall(applicationTypeEntities[0].href);
	}

	getDataFromApplicationTypeEntity() {
		this.feedbackSubmissions = this.applicationTypeEntity.getSubEntitiesByRel(Rels.Feedback.submission);
		this.optOutAction = this.applicationTypeEntity.getActionByName(Actions.feedback.optOut);
		this.sendFeedbackAction = this.applicationTypeEntity.getActionByName(Actions.feedback.submit);
	}

	async setup() {
		this.checkForRequiredParams();
		await this.getApplicationsEntity();
		await this.getApplicationEntity();
		await this.getApplicationTypeEntity();
		this.getDataFromApplicationTypeEntity();
	}

	async shouldShow() {
		await this.setupPromise;
		return !(await this.isOptedOut() || await this.hasRespondedRecently());
	}

	async isOptedOut() {
		await this.setupPromise;
		const properties = this.applicationTypeEntity.properties;

		if (properties.OptOut === 'permanent') {
			return true;
		}

		if (properties.OptOut === 'temporary' && !this.shouldShowAgain(properties.optOutTimeMs)) {
			return true;
		}

		return false;
	}

	shouldShowAgain(timeToCheckMs) {
		if (this.responseFrequency === RESPONSE_FREQUENCY_NEVER_RESHOW) {
			return false;
		}

		return timeToCheckMs > new Date().getMilliseconds() - this.responseFrequency;
	}

	async getMostRecentFeedbackSubmissionTime() {
		await this.setupPromise;
		return this.feedbackSubmissions[0].submittedMs;
	}

	async hasRespondedRecently() {
		await this.setupPromise;

		if (!this.feedbackSubmissions || this.feedbackSubmissions.length === 0) {
			return false;
		}

		return !this.shouldShowAgain(await this.getMostRecentFeedbackSubmissionTime());
	}

	async optionExistsOnField(field, option) {
		return field.value.filter(o => o.value === option).length > 0;
	}

	async optOut() {
		await this.setupPromise;

		if (!this.optOutAction || !this.optOutAction.hasFieldByName('optOutState')) {
			throw new Error('Problem with opt-opt action');
		}
		if (!await this.optionExistsOnField(this.optOutAction.getFieldByName('optOutState'), this.optOutType)) {
			throw new Error(`Invalid opt-out parameter ${this.optOutType}`);
		}
		await this.makeCall(this.optOutAction.href, {
			method: this.optOutAction.method,
			body: { optOutState: this.optOutType }
		});
	}

	async sendFeedback(feedbackObject) {
		await this.setupPromise;

		await this.makeCall(this.sendFeedbackAction.href, {
			method: this.sendFeedbackAction.method,
			body: feedbackObject
		});
	}

	// TODO: when there is an easier way for scripts to hook into the entity store, use that instead of this
	async makeCall(href, { method = 'GET', body } = {}) {
		if (!href) {
			throw new Error('no href provided');
		}
		if (typeof body === 'object') {
			body = JSON.stringify(body);
		}

		const token = (typeof this.token === 'function') ? await this.token() : this.token;

		const response = await d2lfetch.fetch(new Request(href, {
			method,
			body: body,
			headers: {
				Authorization: token
			}
		}));
		if (!response.ok || !this.isSuccessResponse(response)) {
			throw new Error(`${href} call was not successful, status: ${response.status}, ok: ${response.ok}`);
		}
		const responseJSON = await response.json();
		const deserializedResponse = SirenParse(responseJSON);
		return deserializedResponse;
	}

	isSuccessResponse(response) {
		return Math.floor(response.status / 100) === 2;
	}
}
