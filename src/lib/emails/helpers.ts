// Simple cache implementation
import { BLACKLIST_KEYWORDS, RECRUITMENT_KEYWORDS, TRACKING_KEYWORDS } from "../../lib/constants";

const emailCache = new Map<string, string>();

export const getFromCache = (key: string) => {
	return emailCache.get(key);
};

export const setInCache = (key: string, value: string) => {
	emailCache.set(key, value);
};

export function convertEmailIdToDecimal(emailId: string): string {
	try {
		const hexId = emailId.replace(/[^0-9a-fA-F]/g, "");
		const decimalId = BigInt(`0x${hexId}`).toString();
		return BigInt(decimalId) > BigInt("9223372036854775807") ? decimalId.slice(-18) : decimalId;
	} catch (error) {
		console.error(`Error converting email ID ${emailId} to decimal:`, error);
		throw error;
	}
}

export function isTrackingRelevant(subject: string, body: string, status: string): boolean {
	const lowerSubject = subject.toLowerCase();
	const lowerBody = body.toLowerCase();

	// Check for tracking keywords
	const hasTrackingKeyword = TRACKING_KEYWORDS.some(
		(keyword) => lowerSubject.includes(keyword.toLowerCase()) || lowerBody.includes(keyword.toLowerCase())
	);

	// Check for status changes
	const hasStatusIndicator = [
		"rejected",
		"accepted",
		"interviewed",
		"scheduled",
		"pending",
		"reviewing",
		"offered",
	].some((statusWord) => status.toLowerCase().includes(statusWord));

	// Check for common tracking patterns
	const hasTrackingPatterns = [
		/next.*steps/i,
		/status.*update/i,
		/application.*process/i,
		/interview.*(?:schedule|feedback|result)/i,
		/decision.*made/i,
	].some((pattern) => pattern.test(subject) || pattern.test(body));

	return hasTrackingKeyword || hasStatusIndicator || hasTrackingPatterns;
}

export const determineEmailTypeWithoutAI = (
	subject: string,
	body: string,
	senderEmail: string,
	receiverEmail: string
) => {
	const lowerSubject = subject.toLowerCase();
	const lowerBody = body.toLowerCase();
	const lowerSender = senderEmail ? senderEmail.toLowerCase() : "";
	const lowerReceiver = receiverEmail ? receiverEmail.toLowerCase() : "";

	// First check blacklist - if any blacklist keyword is found, immediately mark as irrelevant
	const hasBlacklistedKeyword = BLACKLIST_KEYWORDS.some(
		(keyword) => lowerSubject.includes(keyword) || lowerBody.includes(keyword)
	);

	if (hasBlacklistedKeyword) {
		return {
			isRecruitmentEmail: false,
			emailType: "irrelevant",
			confidence: 0.9,
			stage: "none",
		};
	}

	// Check for recruitment-related keywords with more specific matching
	const hasRecruitmentKeyword = RECRUITMENT_KEYWORDS.some(
		(keyword) => lowerSubject.includes(keyword) || lowerBody.includes(keyword)
	);

	// Check for common recruitment email domains
	const isRecruitmentDomain = [
		"talent",
		"careers",
		"jobs",
		"recruiting",
		"hr",
		"hiring",
		"recruitment",
		"greenhouse.io",
		"lever.co",
		"workday.com",
	].some((domain) => lowerSender.includes(domain));

	// Check for interview-related keywords
	const isInterview = [
		"interview",
		"meeting schedule",
		"technical assessment",
		"coding challenge",
		"phone screen",
	].some((keyword) => lowerSubject.includes(keyword) || lowerBody.includes(keyword));

	// More specific status checks
	const isRejection = [
		"unfortunately",
		"regret to inform",
		"not moving forward",
		"other candidates",
		"not successful",
	].some((keyword) => lowerSubject.includes(keyword) || lowerBody.includes(keyword));

	const isOffer = ["offer letter", "job offer", "pleased to offer", "compensation", "salary details"].some(
		(keyword) => lowerSubject.includes(keyword) || lowerBody.includes(keyword)
	);

	// Require stronger evidence for recruitment emails
	const isRecruitmentEmail =
		(hasRecruitmentKeyword && isRecruitmentDomain) ||
		(hasRecruitmentKeyword && (isInterview || isRejection || isOffer));

	let emailType = "application";
	if (isInterview) emailType = "interview_invitation";
	else if (isRejection) emailType = "rejection";
	else if (isOffer) emailType = "offer";

	return {
		isRecruitmentEmail,
		emailType,
		confidence: isRecruitmentEmail ? 0.9 : 0.3,
		stage: emailType,
	};
};
