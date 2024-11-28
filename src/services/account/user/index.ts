import { createClient } from "@supabase/supabase-js";

interface taglineObject {
	tagline: string;
	hash: string;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl as string, supabaseAnonKey as string);

export async function createUser({ user_id, name, email }: { user_id: string; name: string; email: string }) {
	try {
		const newUser = { user_id, name, email };
		const { data, error } = await supabase
			.from("users") // Replace with your table name
			.upsert(newUser, {
				onConflict: "user_id",
			});

		if (error) {
			console.error("Error creating user:", error);
			return { success: false, error };
		}

		console.log("created user:", data);
		return { success: true, data };
	} catch (e) {
		return { success: false, e };
	}
}

export async function getUser({ user_id }: { user_id: string }) {
	try {
		console.log("fetching user:", user_id);
		const { data, error } = await supabase.from("users").select("*").eq("user_id", user_id);

		if (error) {
			console.error("Error fetching user:", error);
			return { success: false, error, data: {} };
		}

		if (data && data.length) {
			const user = data[0];
			// Parse JSON fields back into their original object format

			return { success: true, data: user };
		} else {
			return { success: true, data: {} }; // No data returned
		}
	} catch (e) {
		console.error("Error fetching user:", e);
		return { success: false, error: e, data: [] };
	}
}

export async function getUserWithEmail({ email }: { email: string }) {
	try {
		const { data, error } = await supabase.from("users").select("*").eq("email", email);

		if (error) {
			console.error("Error fetching user:", error);
			return { success: false, error, data: {} };
		}

		if (data && data.length) {
			const user = data[0];
			// Parse JSON fields back into their original object format

			return { success: true, data: user };
		} else {
			return { success: true, data: {} }; // No data returned
		}
	} catch (e) {
		console.error("Error fetching user:", e);
		return { success: false, error: e, data: [] };
	}
}

export async function deleteUser({ user_id }: any) {
	try {
		const { data, error } = await supabase.from("users").delete().eq("user_id", user_id);

		if (error) {
			console.error("Error deleting user:", error);
			return { success: false, error, data: [] };
		}

		if (data) {
			// Parse JSON fields back into their original object format

			return { success: true, data };
		} else {
			return { success: true, data: [] }; // No data returned
		}
	} catch (e) {
		console.error("Error deleting preferences:", e);
		return { success: false, error: e, data: [] };
	}
}
