export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  role: "user" | "admin";
  created_at: string;
};

export type Drawing = {
  id: string;
  owner_id: string;
  title: string;
  scene: { elements: unknown[]; appState: Record<string, unknown> };
  thumbnail: string | null;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Folder = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
};

export type Library = {
  id: string;
  owner_id: string | null;
  name: string;
  description: string | null;
  scope: "user" | "global";
  data: { libraryItems?: unknown[]; library?: unknown[] };
  storage_path: string | null;
  created_at: string;
};
