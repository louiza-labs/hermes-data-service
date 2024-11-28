import { deletePreferences, getPreferences, uploadPreference } from "../../../services/account/verify/preferences";

export async function addPreferenceForUser(c: any) {
	const body = await c.req.json();

	const { type, value, user_id } = body;

	const uploadRes = await uploadPreference({
		user_id,
		type,
		value,
	});
	return c.json(uploadRes);
}

export async function getPreferenceForUser(c: any) {
	const user_id = c.req.query("user_id");
	const { data, success } = await getPreferences({ user_id });
	return c.json(data);
}

export async function removePreferenceForUser(c: any) {
	const { preference_name, user_id, preference_value } = c.req.param();

	const resForDeletingPreference = await deletePreferences({ user_id, type: preference_name, value: preference_value });
	return c.json(resForDeletingPreference);
}
