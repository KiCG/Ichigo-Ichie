-- Add per-recipient bookshelf preference to album_shares.
-- The recipient cannot modify albums.bookshelf_id (owned by another user),
-- so we store their own organization preference here instead.
ALTER TABLE album_shares
  ADD COLUMN IF NOT EXISTS recipient_bookshelf_id uuid REFERENCES bookshelves(id) ON DELETE SET NULL;

-- Allow the recipient to update only their own share record's bookshelf preference.
-- WITH CHECK ensures the chosen bookshelf actually belongs to them.
CREATE POLICY "album_shares_recipient_update_bookshelf"
  ON album_shares FOR UPDATE
  TO authenticated
  USING (shared_to_user_id = auth.uid())
  WITH CHECK (
    shared_to_user_id = auth.uid()
    AND (
      recipient_bookshelf_id IS NULL
      OR EXISTS (
        SELECT 1 FROM bookshelves
        WHERE bookshelves.id = recipient_bookshelf_id
          AND bookshelves.user_id = auth.uid()
      )
    )
  );
