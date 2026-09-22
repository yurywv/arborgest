/** URL autenticada para exibir/baixar um arquivo armazenado. */
export const fileUrl = (key: string) => `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
