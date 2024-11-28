import { createUser } from "../../../services/account/user";
import { uploadMultiplePreferences } from "../../../services/account/verify/preferences";
import { uploadConnections } from "../../../services/connections/linkedin";

export async function createAccountHandler(c: any) {
	const body = await c.req.json();

	const { name, email, username, preferences, connections } = body;

	try {
		const { success: userCreated, data: userData } = await createUser({
			user_id: username,
			email,
			name,
		});

		if (!userCreated) throw new Error("User creation failed");

		const { success: preferencesUploaded } = await uploadMultiplePreferences({ preferences });
		if (!preferencesUploaded) throw new Error("Preferences upload failed");

		const { success: connectionsUploaded } = await uploadConnections({ connections, user_id: username });
		if (!connectionsUploaded) throw new Error("Connections upload failed");

		return c.json({ message: "Success creating account", success: true });
	} catch (error) {
		return c.json({ message: error, success: false });
	}
}
