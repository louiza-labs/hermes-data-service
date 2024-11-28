import { generateMatchingJobsForConnections } from "../../lib/intros";
import { getUser } from "../../services/account/user";
import { getPreferences } from "../../services/account/verify/preferences";
import { getLinkedinConnectionsFromDB } from "../../services/connections/linkedin";
import { sendEmail } from "../../services/email";
import { getJobsFromLinkedinFromDB } from "../../services/jobs";

export async function sendEmailForUser(c: any) {
	// const { email, preferences } = await c.req.json();
	const { user_id } = await c.req.json();
	const { data: user } = await getUser({ user_id });
	const { data: connections } = await getLinkedinConnectionsFromDB({ user_id });
	const { data: preferences } = await getPreferences({ user_id });
	const { data: jobs } = await getJobsFromLinkedinFromDB();

	const filteredConnectionsForCompanies = connections.filter((connection) => connection.Company);

	const connectionsWithMatchingCompanyPreferences = filteredConnectionsForCompanies.filter((connection: any) => {
		return preferences.find(
			(preference) =>
				preference.type === "company" && preference.value.toLowerCase() === connection.Company.toLowerCase()
		);
	});

	const connectionsAtRelevantCompaniesWithOpenPositions = connectionsWithMatchingCompanyPreferences
		.map((connection: any) => {
			const matchingJob = jobs?.find((job: any) => job.company.toLowerCase() === connection.Company.toLowerCase());
			if (matchingJob) {
				return { ...connection, matchingJob }; // Add matching job to connection
			}
			return null; // Return null if no matching job
		})
		.filter((connection) => connection !== null); // Filter out null values

	const filteredConnections = connections.filter((connection) => {
		return connection.Company;
	});
	const filteredJobs = generateMatchingJobsForConnections(filteredConnections, preferences as any, jobs);

	await sendEmail({
		recommendedProfiles: connectionsAtRelevantCompaniesWithOpenPositions,
		recommendedPositions: filteredJobs,
		user,
	});
	return c.json({
		message: "Sent email!",
		dataForEmail: {
			recommendedProfiles: connectionsAtRelevantCompaniesWithOpenPositions,
			recommendedPositions: filteredJobs,
			user,
		},
	});
}
