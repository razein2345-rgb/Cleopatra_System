import { useEffect, useState } from 'react';
import type { BusinessPartner, PartnerCategory, PartnerTag } from '@cleopatra/shared';
import { apiGet, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';

/** Order-independent identity key for a tag-id set, used to detect when
 * `partner.tagIds` changed underneath us (e.g. after a save) without
 * relying on array reference equality. */
function tagIdsKey(ids: string[]): string {
  return [...ids].sort().join(',');
}

/** Partner Profile → Category & Tags section — FEATURE-002 Milestone 4. */
export function CategoryTagsSection({
  partner,
  canEdit,
  onSaved,
}: {
  partner: BusinessPartner;
  canEdit: boolean;
  onSaved: (partner: BusinessPartner) => void;
}) {
  const [categories, setCategories] = useState<PartnerCategory[] | null>(null);
  const [tags, setTags] = useState<PartnerTag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(partner.tagIds);
  const [tagsSubmitting, setTagsSubmitting] = useState(false);
  // Tracks which `partner.tagIds` the local selection was last synced from —
  // compared during render (React's documented pattern for "adjusting state
  // when a prop changes") rather than in an effect, so there's no
  // cascading-render lint violation and no extra render pass.
  const [syncedTagIdsKey, setSyncedTagIdsKey] = useState(tagIdsKey(partner.tagIds));

  const currentTagIdsKey = tagIdsKey(partner.tagIds);
  if (currentTagIdsKey !== syncedTagIdsKey) {
    setSelectedTagIds(partner.tagIds);
    setSyncedTagIdsKey(currentTagIdsKey);
  }
  const tagsDirty = tagIdsKey(selectedTagIds) !== currentTagIdsKey;

  useEffect(() => {
    Promise.all([
      apiGet<PartnerCategory[]>('/api/partner-categories'),
      apiGet<PartnerTag[]>('/api/partner-tags'),
    ])
      .then(([c, t]) => {
        setCategories(c);
        setTags(t);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load categories/tags'),
      );
  }, []);

  const changeCategory = async (categoryId: string) => {
    setError(null);
    setCategorySubmitting(true);
    try {
      const updated = await apiPut<BusinessPartner>(`/api/partners/${partner.id}/category`, {
        categoryId: categoryId || null,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change category');
    } finally {
      setCategorySubmitting(false);
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  const saveTags = async () => {
    setError(null);
    setTagsSubmitting(true);
    try {
      const updated = await apiPut<BusinessPartner>(`/api/partners/${partner.id}/tags`, {
        tagIds: selectedTagIds,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tags');
    } finally {
      setTagsSubmitting(false);
    }
  };

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!categories || !tags) {
    return <div className="text-muted-foreground text-sm">Loading category/tags…</div>;
  }

  // Inactive options stay selectable only if the partner already holds them
  // (M4: "Inactive Categories or Tags cannot be assigned" — not "cannot
  // remain assigned"; clearing/removing an inactive selection must still
  // work).
  const categoryOptions = categories.filter(
    (c) => c.isActive || c.id === partner.categoryId,
  );
  const tagOptions = tags.filter((t) => t.isActive || partner.tagIds.includes(t.id));

  return (
    <div className="border-border bg-card space-y-4 rounded-2xl border p-4">
      <h2 className="font-semibold">Category &amp; Tags</h2>

      <label className="block space-y-1 text-sm sm:max-w-xs">
        <span className="text-muted-foreground">Category</span>
        <select
          disabled={!canEdit || categorySubmitting}
          value={partner.categoryId ?? ''}
          onChange={(e) => void changeCategory(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
        >
          <option value="">— none —</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {!c.isActive ? ' (inactive)' : ''}
            </option>
          ))}
        </select>
      </label>

      <div>
        <p className="text-muted-foreground mb-1.5 text-sm">Tags</p>
        <div className="flex flex-wrap gap-3">
          {tagOptions.map((tag) => (
            <label key={tag.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={selectedTagIds.includes(tag.id)}
                onChange={() => toggleTag(tag.id)}
              />
              {tag.name}
              {!tag.isActive ? ' (inactive)' : ''}
            </label>
          ))}
          {tagOptions.length === 0 && <span className="text-muted-foreground text-sm">No tags yet.</span>}
        </div>
        {canEdit && (
          <Button
            className="mt-3"
            size="sm"
            disabled={!tagsDirty || tagsSubmitting}
            onClick={() => void saveTags()}
          >
            {tagsSubmitting ? 'Saving…' : 'Save Tags'}
          </Button>
        )}
      </div>
    </div>
  );
}
