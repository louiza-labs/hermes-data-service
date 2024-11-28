import { filterConnectionsByCompanyPreferences, filterConnectionsByPositionPreferences } from "../../../lib/filtering";
import { addJobToConnection } from "../../../lib/normalization";
import { getPreferences } from "../../../services/account/verify/preferences";
import { getLinkedinConnectionsFromDB, uploadConnections } from "../../../services/connections/linkedin";
import { getJobsFromLinkedinFromDB } from "../../../services/jobs";

export async function fetchLinkedInConnectionsHandler(c: any) {
	const { user_id } = c.req.query();
	const connections = await getLinkedinConnectionsFromDB({ user_id });
	// const normalizedAlerts = normalizeAlertsData(con, "test", "los-angeles");
	return c.json(connections);
}

export async function fetchLinkedInConnectionsAtRelevantJobsHandler(c: any) {
	const user_id = c.req.query("user_id");

	// Fetch data from DB
	const { data: connections } = await getLinkedinConnectionsFromDB({ user_id });
	const { data: preferences } = await getPreferences({ user_id });
	const { data: jobs } = await getJobsFromLinkedinFromDB();

	// Filter connections who work at companies
	const filteredConnectionsForCompanies = connections.filter((connection) => connection.Company);
	const hasCompanyPreferences =
		preferences && preferences.filter((preference) => preference.type === "company").length > 0 ? true : null;
	const hasPositionPreferences =
		preferences && preferences.filter((preference) => preference.type === "position").length > 0 ? true : null;
	// Get connections based on company preferences
	const connectionsMatchingCompanyPreferences = filterConnectionsByCompanyPreferences(
		filteredConnectionsForCompanies,
		jobs,
		preferences
	);

	// Get connections based on position preferences
	const connectionsMatchingPositionPreferences = filterConnectionsByPositionPreferences(
		filteredConnectionsForCompanies,
		jobs,
		preferences
	);

	const connectionsMatchingBothPreferences = connectionsMatchingCompanyPreferences.filter((connection) =>
		connectionsMatchingPositionPreferences.some(
			(posConnection) => posConnection.UserName === connection.UserName // Assuming each connection has a unique 'id'
		)
	);

	if (hasCompanyPreferences) {
		return c.json(connectionsMatchingBothPreferences);
	} else if (hasPositionPreferences) {
		return c.json(connectionsMatchingPositionPreferences);
	} else {
		const allConnectionsWithJobs = addJobToConnection(filteredConnectionsForCompanies, jobs);
		return c.json(allConnectionsWithJobs);
	}
}

export async function uploadConnectionsHandler(c: any) {
	const body = await c.req.json();

	const { user_id, connections } = body;

	try {
		const { success: connectionsUploaded } = await uploadConnections({ connections, user_id });
		if (!connectionsUploaded) throw new Error("Connections upload failed");

		return c.json({ message: "Success uploading connections", success: true });
	} catch (error) {
		console.log("error uploading connections", error);
		return c.json({ message: error, success: false });
	}
}
