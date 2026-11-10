-- A header image for a note, shown at the top of the note and as its card
-- thumbnail in the workspace. Stored inline like drawing thumbnails (a
-- downscaled JPEG data URL, or an https URL), so no storage bucket is needed.
alter table public.notes
  add column cover_image text
  check (cover_image is null or char_length(cover_image) <= 2000000);
