import { COMPANY_NAME_BLACKLIST } from "../../../lib/constants";

export class CompanyExtractor {
	private readonly GENERIC_DOMAINS = ["gmail", "yahoo", "hotmail", "outlook", "aol", "mail"];
	private readonly COMPANY_PATTERNS = [
		// Strong indicators
		/(?:welcome to|joining) ([\w\s&-]+?)(?:\.|,|\n|$)/i,
		/position at ([\w\s&-]+?)(?:\.|,|\n|$)/i,
		/(?:behalf of|representing) ([\w\s&-]+?)(?:\.|,|\n|$)/i,
		// Job application specific
		/applied (?:to|for)(?: a position at)? ([\w\s&-]+?)(?:\.|,|\n|$)/i,
		/application (?:to|for) ([\w\s&-]+?)(?:\.|,|\n|$)/i,
		/(?:opportunity|position|role) (?:at|with) ([\w\s&-]+?)(?:\.|,|\n|$)/i,
		// Email signature patterns
		/(?:\r?\n|\r)(?:regards|best|sincerely|thank you)[,\s\n]+[\w\s]+\n([\w\s&-]+?)(?:\.|,|\n|$)/i,
		// Fallback patterns
		/(?:^|\n)([\w\s&-]+?) is hiring/i,
		/(?:^|\n)([\w\s&-]+?) team/i,
	];

	private cleanCompanyName(name: string): string {
		if (!name) return "";
		return name
			.split(/[\s,.-]+/)
			.filter((word) => word.length > 1 && !COMPANY_NAME_BLACKLIST.includes(word.toLowerCase()))
			.join(" ")
			.trim();
	}

	private extractFromEmailDomain(from: string): string | null {
		if (!from) return null;

		const emailDomain = this.parseEmailDomain(from);
		if (!emailDomain) return null;

		const domain = emailDomain.split(".")[0];
		if (!domain || this.GENERIC_DOMAINS.includes(domain)) return null;

		return this.capitalizeFirstLetter(domain);
	}

	private parseEmailDomain(from: string): string | null {
		// Try to match format "Name <email@domain.com>"
		const angleMatch = from.match(/<([^>]+)>/);
		if (angleMatch) {
			return angleMatch[1].split("@")[1];
		}

		// Try direct email format "email@domain.com"
		const parts = from.split("@");
		return parts.length > 1 ? parts[1] : null;
	}

	private capitalizeFirstLetter(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}

	private extractFromPatterns(text: string): string | null {
		for (const pattern of this.COMPANY_PATTERNS) {
			const match = text.match(pattern);
			if (match) {
				const cleaned = this.cleanCompanyName(match[1]);
				if (cleaned && cleaned.length >= 2) {
					return cleaned;
				}
			}
		}
		return null;
	}

	public extract(body: string, subject: string, from: string): string | null {
		// First try to extract from email domain
		const domainCompany = this.extractFromEmailDomain(from);
		if (domainCompany) return domainCompany;

		// Then try to extract from body and subject
		const combinedText = `${body} ${subject}`;
		return this.extractFromPatterns(combinedText);
	}
}
