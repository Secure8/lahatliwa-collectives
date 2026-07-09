import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ExternalLink, Plus, Save, Trash2, Upload } from 'lucide-react';
import {
  createExternalGalleryItem,
  createImageGalleryItem,
  detectGalleryPlatform,
  galleryItemTypes,
  normalizeGalleryItem,
  platformLabel,
} from '../../lib/galleryItems';
import { canApproveProjects, canEditProject, useAdminAccess } from '../../lib/adminAccess';
import { categories, parseList, slugify } from '../../lib/helpers';
import { uploadStatusText } from '../../lib/imageCompression';
import { supabase } from '../../lib/supabaseClient';
import {
  deleteImages,
  getPublicImageUrl,
  isPdfFile,
  uploadCoverImage,
  uploadExternalThumbnail,
  uploadGalleryImages,
  validateCoverUploadFile,
  validateExternalThumbnailUploadFile,
  validateGalleryUploadFile,
} from '../../lib/storage';
import { AdminCheckbox, AdminSoftPanel, AdminSurface } from './AdminUI';
import ImageUploader from './ImageUploader';

const emptyProject = {
  title: '',
  slug: '',
  category: categories[0],
  description: '',
  tools: '',
  cover_image: '',
  gallery_images: [],
  gallery_items: [],
  video_url: '',
  social_post_url: '',
  live_url: '',
  github_url: '',
  project_date: '',
  status: 'draft',
  featured: false,
  review_status: 'draft',
  review_notes: '',
};

const contributorRoles = [
  'Photographer',
  'Photo Editor',
  'Videographer',
  'Video Editor',
  'Social Media Manager',
  'Content Planner',
  'Web Developer',
  'Graphic Designer',
  'Creative Director',
  'Project Lead',
  'Contributor',
];

export default function ProjectForm({ initialProject, mode = 'new' }) {
  const navigate = useNavigate();
  const { role, user, adminUser } = useAdminAccess();
  const canApprove = canApproveProjects(role);
  const canEditCurrent = !initialProject || canEditProject(role, initialProject, user?.id);
  const draftKey = useMemo(() => `hevv-project-form-draft-v2:${mode}:${initialProject?.id || 'new'}`, [mode, initialProject?.id]);
  const [form, setForm] = useState(emptyProject);
  const [slugTouched, setSlugTouched] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [optimizationMessage, setOptimizationMessage] = useState('');
  const [removedGalleryPaths, setRemovedGalleryPaths] = useState([]);
  const [pendingGalleryFiles, setPendingGalleryFiles] = useState([]);
  const [creativeMembers, setCreativeMembers] = useState([]);
  const [selectedCreativeIds, setSelectedCreativeIds] = useState([]);
  const [contributorDetails, setContributorDetails] = useState({});
  const [externalUrl, setExternalUrl] = useState('');
  const [bulkExternalUrls, setBulkExternalUrls] = useState('');
  const [error, setError] = useState('');
  const pendingGalleryFilesRef = useRef([]);
  const submitActionRef = useRef('save');

  useEffect(() => {
    setDraftReady(false);
    setDirty(false);
    setRemovedGalleryPaths([]);
    setPendingGalleryFiles((current) => {
      current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
    const baseForm = initialProject
      ? {
          ...emptyProject,
          ...initialProject,
          tools: Array.isArray(initialProject.tools) ? initialProject.tools.join(', ') : initialProject.tools || '',
          gallery_images: initialProject.gallery_images || [],
          gallery_items: Array.isArray(initialProject.gallery_items)
            ? initialProject.gallery_items.map(normalizeGalleryItem)
            : [],
        }
      : emptyProject;

    let savedDraft = {};
    try {
      savedDraft = JSON.parse(window.localStorage.getItem(draftKey) || '{}');
    } catch {
      savedDraft = {};
    }

    const hasDraft = Object.keys(savedDraft).length > 0;
    setForm({ ...baseForm, ...savedDraft });
    setDirty(hasDraft);
    setDraftReady(true);
  }, [initialProject, draftKey]);

  useEffect(() => {
    if (!draftReady || !dirty) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(form));
    } catch {
    }
  }, [dirty, draftKey, draftReady, form]);

  useEffect(() => {
    if (!draftReady || !dirty) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty, draftReady]);

  useEffect(() => {
    if (initialProject) {
      setSlugTouched(true);
    }
  }, [initialProject]);

  useEffect(() => {
    async function loadCreativeOptions() {
      const { data } = await supabase
        .from('creative_members')
        .select('id, name, role')
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });
      setCreativeMembers(data || []);

      if (initialProject?.id) {
        const { data: links } = await supabase
          .from('project_creatives')
          .select('creative_id, creative_member_id, contribution_role, role, is_primary, display_order')
          .eq('project_id', initialProject.id);
        const normalizedLinks = (links || []).map((link) => ({
          creativeId: link.creative_member_id || link.creative_id,
          role: link.role || link.contribution_role || 'Contributor',
          isPrimary: link.is_primary === true,
          displayOrder: link.display_order ?? '',
        })).filter((link) => link.creativeId);
        setSelectedCreativeIds(normalizedLinks.map((link) => link.creativeId));
        setContributorDetails(Object.fromEntries(normalizedLinks.map((link) => [link.creativeId, {
          role: link.role,
          isPrimary: link.isPrimary,
          displayOrder: link.displayOrder,
        }])));
      } else {
        const linkedCreativeId = adminUser?.creative_member_id || '';
        setSelectedCreativeIds(linkedCreativeId ? [linkedCreativeId] : []);
        setContributorDetails(linkedCreativeId ? { [linkedCreativeId]: { role: 'Project Lead', isPrimary: true, displayOrder: 0 } } : {});
      }
    }
    loadCreativeOptions();
  }, [adminUser?.creative_member_id, initialProject?.id]);

  useEffect(() => {
    pendingGalleryFilesRef.current = pendingGalleryFiles;
  }, [pendingGalleryFiles]);

  useEffect(() => () => {
    pendingGalleryFilesRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }, []);

  function update(name, value) {
    setDirty(true);
    setForm((current) => ({ ...current, [name]: value }));
  }

  function trackImageUpload(status) {
    const statusText = uploadStatusText(status);
    if (statusText) setUploadStatus(statusText);
    if (status?.message) setOptimizationMessage(status.message);
  }

  function updateTitle(value) {
    setForm((current) => ({
      ...current,
      title: value,
      slug: slugTouched || mode === 'edit' ? current.slug : slugify(value),
    }));
    setDirty(true);
  }

  function updateSlug(value) {
    setSlugTouched(true);
    update('slug', value);
  }

  async function uploadCover(files) {
    const file = files?.[0];
    if (!file) return;
    setError('');
    setOptimizationMessage('');
    try {
      validateCoverUploadFile(file);
      setUploadingImages(true);
      const path = await uploadCoverImage(file, { onStatus: trackImageUpload });
      update('cover_image', path);
    } catch (uploadError) {
      setError(uploadError.message || 'Cover image upload failed.');
    } finally {
      setUploadingImages(false);
      setUploadStatus('');
    }
  }

  function selectGalleryFiles(files) {
    if (!files?.length) return;
    setError('');
    try {
      const selectedFiles = Array.from(files);
      selectedFiles.forEach(validateGalleryUploadFile);
      setPendingGalleryFiles((current) => [
        ...current,
        ...selectedFiles.map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
          file,
          isPdf: file.type === 'application/pdf',
          previewUrl: file.type === 'application/pdf' ? '' : URL.createObjectURL(file),
        })),
      ]);
      setDirty(true);
    } catch (uploadError) {
      setError(uploadError.message || 'Gallery file selection failed.');
    }
  }

  function removePendingGalleryFile(id) {
    setPendingGalleryFiles((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== id);
    });
    setDirty(true);
  }

  function removeGalleryFile(path) {
    setForm((current) => ({
      ...current,
      gallery_images: (current.gallery_images || []).filter((image) => image !== path),
      gallery_items: (current.gallery_items || []).filter((item) => item.url !== path),
    }));
    setDirty(true);
    setRemovedGalleryPaths((current) => current.includes(path) ? current : [...current, path]);
  }

  function toggleCreative(id) {
    setSelectedCreativeIds((current) => (
      current.includes(id) ? current.filter((creativeId) => creativeId !== id) : [...current, id]
    ));
    setContributorDetails((current) => ({
      ...current,
      [id]: current[id] || { role: 'Contributor', isPrimary: false, displayOrder: selectedCreativeIds.length * 100 },
    }));
    setDirty(true);
  }

  function updateContributor(id, patch) {
    setContributorDetails((current) => {
      const next = { ...current };
      if (patch.isPrimary === true) {
        selectedCreativeIds.forEach((creativeId) => {
          next[creativeId] = { ...(next[creativeId] || { role: 'Contributor', isPrimary: false, displayOrder: '' }), isPrimary: false };
        });
      }
      next[id] = { ...(next[id] || { role: 'Contributor', isPrimary: false, displayOrder: '' }), ...patch };
      return next;
    });
    setDirty(true);
  }

  function externalGalleryItems() {
    return (form.gallery_items || []).filter((item) => !['image', 'pdf'].includes(item.type));
  }

  function addExternalUrls(urls) {
    const cleanUrls = urls.map((url) => url.trim()).filter(Boolean);
    if (!cleanUrls.length) return;
    setForm((current) => {
      const existing = current.gallery_items || [];
      const nextOrder = existing.length * 100;
      const newItems = cleanUrls.map((url, index) => createExternalGalleryItem(url, nextOrder + index * 100));
      return { ...current, gallery_items: [...existing, ...newItems] };
    });
    setDirty(true);
  }

  function addSingleExternalUrl() {
    addExternalUrls([externalUrl]);
    setExternalUrl('');
  }

  function addBulkExternalUrls() {
    addExternalUrls(bulkExternalUrls.split(/\r?\n/));
    setBulkExternalUrls('');
  }

  function updateExternalItem(id, patch) {
    let removedThumbnailPath = '';
    setForm((current) => ({
      ...current,
      gallery_items: (current.gallery_items || []).map((item) => {
        if (item.id !== id) return item;
        if (
          Object.prototype.hasOwnProperty.call(patch, 'thumbnail_url')
          && patch.thumbnail_storage_path === ''
          && item.thumbnail_storage_path
        ) {
          removedThumbnailPath = item.thumbnail_storage_path;
        }
        const nextItem = { ...item, ...patch };
        if (Object.prototype.hasOwnProperty.call(patch, 'url')) {
          const detected = detectGalleryPlatform(patch.url);
          nextItem.type = detected.type;
          nextItem.platform = detected.platform;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'type')) {
          nextItem.platform = platformLabel(patch.type);
        }
        return nextItem;
      }),
    }));
    if (removedThumbnailPath) {
      setRemovedGalleryPaths((current) => current.includes(removedThumbnailPath) ? current : [...current, removedThumbnailPath]);
    }
    setDirty(true);
  }

  async function uploadExternalItemThumbnail(item, file) {
    if (!file) return;
    setError('');
    setOptimizationMessage('');
    try {
      validateExternalThumbnailUploadFile(file);
      setUploadingImages(true);
      const path = await uploadExternalThumbnail(file, form.slug || slugify(form.title), { onStatus: trackImageUpload });
      const oldPath = item.thumbnail_storage_path;
      updateExternalItem(item.id, {
        thumbnail_url: getPublicImageUrl(path),
        thumbnail_storage_path: path,
      });
      if (oldPath) {
        setRemovedGalleryPaths((current) => current.includes(oldPath) ? current : [...current, oldPath]);
      }
    } catch (uploadError) {
      setError(uploadError.message || 'Thumbnail upload failed.');
    } finally {
      setUploadingImages(false);
      setUploadStatus('');
    }
  }

  function removeExternalItem(id) {
    const item = (form.gallery_items || []).find((galleryItem) => galleryItem.id === id);
    setForm((current) => ({
      ...current,
      gallery_items: (current.gallery_items || []).filter((galleryItem) => galleryItem.id !== id),
    }));
    if (item?.thumbnail_storage_path) {
      setRemovedGalleryPaths((current) => current.includes(item.thumbnail_storage_path) ? current : [...current, item.thumbnail_storage_path]);
    }
    setDirty(true);
  }

  function moveExternalItem(id, direction) {
    const externalItems = externalGalleryItems();
    const currentIndex = externalItems.findIndex((item) => item.id === id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= externalItems.length) return;

    const reordered = [...externalItems];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    const reorderedMap = new Map(reordered.map((item, index) => [item.id, { ...item, order: 1000 + index * 100 }]));

    setForm((current) => ({
      ...current,
      gallery_items: (current.gallery_items || []).map((item) => reorderedMap.get(item.id) || item),
    }));
    setDirty(true);
  }

  function clearDraft() {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    let uploadedGalleryPaths = [];
    const submitAction = submitActionRef.current || 'save';
    submitActionRef.current = 'save';

    if (!canEditCurrent && ['save', 'submit'].includes(submitAction)) {
      setSaving(false);
      setError('You do not have permission to edit this project.');
      return;
    }
    if (['approve', 'reject', 'publish', 'archive'].includes(submitAction) && !canApprove) {
      setSaving(false);
      setError('You do not have permission to review this project.');
      return;
    }

    try {
      setOptimizationMessage('');
      uploadedGalleryPaths = pendingGalleryFiles.length
        ? await uploadGalleryImages(pendingGalleryFiles.map((item) => item.file), { onStatus: trackImageUpload })
        : [];
      const updatedGalleryImages = [...(form.gallery_images || []), ...uploadedGalleryPaths];
      const currentItems = form.gallery_items || [];
      const existingItemByUrl = new Map(currentItems.map((item) => [item.url, normalizeGalleryItem(item)]));
      const imageItems = updatedGalleryImages.map((path, index) => (
        existingItemByUrl.get(path) || createImageGalleryItem(path, index * 100)
      ));
      const externalItems = currentItems
        .filter((item) => !['image', 'pdf'].includes(item.type))
        .map(normalizeGalleryItem)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((item, index) => normalizeGalleryItem({ ...item, order: 1000 + index * 100 }, index));
      const now = new Date().toISOString();
      const nextReviewStatus = submitAction === 'submit'
        ? 'pending_review'
        : submitAction === 'approve'
          ? 'approved'
          : submitAction === 'reject'
            ? 'rejected'
            : submitAction === 'publish'
              ? 'published'
              : submitAction === 'archive'
                ? 'archived'
                : form.review_status || 'draft';
      const nextStatus = submitAction === 'publish'
        ? 'published'
        : ['submit', 'approve', 'reject', 'archive'].includes(submitAction)
          ? 'draft'
          : canApprove
            ? form.status
            : 'draft';
      const payload = {
        title: form.title,
        slug: slugify(form.slug || form.title),
        category: form.category,
        description: form.description,
        tools: parseList(form.tools),
        cover_image: form.cover_image,
        gallery_images: updatedGalleryImages,
        gallery_items: [...imageItems, ...externalItems],
        video_url: form.video_url || null,
        social_post_url: form.social_post_url || null,
        live_url: form.live_url || null,
        github_url: form.github_url || null,
        project_date: form.project_date || null,
        status: nextStatus,
        featured: form.featured,
        review_status: nextReviewStatus,
        submitted_at: submitAction === 'submit' ? now : form.submitted_at || null,
        reviewed_by: ['approve', 'reject', 'publish', 'archive'].includes(submitAction) ? user?.id : form.reviewed_by || null,
        reviewed_at: ['approve', 'reject', 'publish', 'archive'].includes(submitAction) ? now : form.reviewed_at || null,
        review_notes: form.review_notes || null,
        created_by: initialProject?.created_by || user?.id || null,
        owner_user_id: initialProject?.owner_user_id || user?.id || null,
        updated_by: user?.id || null,
        updated_at: now,
      };

      const query = mode === 'edit'
        ? supabase.from('projects').update(payload).eq('id', initialProject.id).select('id').single()
        : supabase.from('projects').insert(payload).select('id').single();
      const { data: savedProject, error: saveError } = await query;
      if (saveError) throw saveError;
      const projectId = initialProject?.id || savedProject?.id;
      if (projectId) {
        await supabase.from('project_creatives').delete().eq('project_id', projectId);
        if (selectedCreativeIds.length) {
          const contributorRows = selectedCreativeIds.map((creativeId, index) => ({
            project_id: projectId,
            creative_id: creativeId,
            creative_member_id: creativeId,
            contribution_role: contributorDetails[creativeId]?.role || 'Contributor',
            role: contributorDetails[creativeId]?.role || 'Contributor',
            is_primary: contributorDetails[creativeId]?.isPrimary === true,
            display_order: contributorDetails[creativeId]?.displayOrder === '' || contributorDetails[creativeId]?.displayOrder == null
              ? index * 100
              : Number(contributorDetails[creativeId].displayOrder),
          }));
          const { error: contributorError } = await supabase.from('project_creatives').insert(contributorRows);
          if (contributorError) throw contributorError;
        }
      }
      if (removedGalleryPaths.length) await deleteImages(removedGalleryPaths);
      pendingGalleryFiles.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      setPendingGalleryFiles([]);
      clearDraft();
      setDirty(false);
      navigate('/admin/projects');
    } catch (saveError) {
      if (uploadedGalleryPaths.length) {
        try {
          await deleteImages(uploadedGalleryPaths);
        } catch {
        }
      }
      setError(saveError.message || 'Something went wrong while saving this project.');
    } finally {
      setSaving(false);
      setUploadStatus('');
    }
  }

  const externalItems = externalGalleryItems().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      {error && <div className="rounded-md bg-red-300/10 p-4 text-sm text-red-100 ring-1 ring-red-300/20">{error}</div>}
      {uploadStatus && <div role="status" className="rounded-md bg-white/[0.045] p-3 text-sm text-zinc-300 ring-1 ring-white/[0.07]">{uploadStatus}</div>}
      {optimizationMessage && <div className="rounded-md bg-emerald-300/[0.07] p-3 text-sm text-emerald-100 ring-1 ring-emerald-300/15">{optimizationMessage}</div>}

      <FormSection eyebrow="Basic project info" title="Core details" description="Set the public title, URL slug, category, and description.">
      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Title" required value={form.title} onChange={(value) => updateTitle(value)} />
        <Field label="Slug" required value={form.slug} onChange={updateSlug} onBlur={() => update('slug', slugify(form.slug))} />
        <label className="grid gap-2 text-sm text-zinc-300">
          Category
          <select className="rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45" value={form.category} onChange={(event) => update('category', event.target.value)} required>
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm text-zinc-300">
          Status
          <select className="rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45 disabled:cursor-not-allowed disabled:opacity-60" value={canApprove ? form.status : 'draft'} onChange={(event) => update('status', event.target.value)} disabled={!canApprove}>
            <option value="draft">draft</option>
            <option value="published">published</option>
          </select>
        </label>
      </div>

      <label className="grid gap-2 text-sm text-zinc-300">
        Description
        <textarea className="min-h-36 rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45" value={form.description} onChange={(event) => update('description', event.target.value)} required />
      </label>

      <Field label="Tools used, separated by commas" value={form.tools} onChange={(value) => update('tools', value)} />
      </FormSection>

      <FormSection eyebrow="Cover and gallery" title="Media uploads" description="Upload the project cover, gallery images, PDFs, and review pending files before saving.">
      <div className="grid gap-5 lg:grid-cols-2">
        <ImageUploader
          label={uploadingImages ? 'Uploading image...' : form.cover_image ? 'Replace cover image' : 'Upload cover image'}
          hint="Large JPEG, PNG, or WebP files are resized to 1600px and optimized to 1 MB."
          onChange={uploadCover}
        />
        <ImageUploader
          label={pendingGalleryFiles.length ? `${pendingGalleryFiles.length} new file(s) ready to add` : 'Add more gallery images or PDFs'}
          hint="Images are optimized to 1 MB each. PDFs keep a 2 MB hard limit."
          accept="image/*,application/pdf"
          multiple
          onChange={selectGalleryFiles}
        />
      </div>
      {(form.cover_image || form.gallery_images?.length > 0 || pendingGalleryFiles.length > 0) && (
        <AdminSoftPanel className="grid gap-4">
          {form.cover_image && (
            <div>
              <p className="mb-2 text-xs text-zinc-500">Cover image</p>
              <img src={getPublicImageUrl(form.cover_image)} alt="" className="h-28 max-w-full rounded-md object-cover" />
            </div>
          )}
          {form.gallery_images?.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-zinc-500">Saved gallery files</p>
              <div className="flex flex-wrap gap-2">
                {form.gallery_images.map((file) => (
                  <div key={file} className="relative">
                    {isPdfFile(file)
                      ? <a href={getPublicImageUrl(file)} target="_blank" rel="noreferrer" className="grid h-20 w-24 place-items-center rounded-md bg-white/[0.05] pr-7 text-xs text-zinc-300 ring-1 ring-white/[0.07]">PDF</a>
                      : <img src={getPublicImageUrl(file)} alt="" className="h-20 w-24 rounded-md object-cover" />}
                    <button
                      type="button"
                      onClick={() => removeGalleryFile(file)}
                      className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-md bg-zinc-950/85 text-zinc-300 transition hover:text-red-200"
                      aria-label="Remove gallery file"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pendingGalleryFiles.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-zinc-500">New gallery files to add</p>
              <div className="flex flex-wrap gap-2">
                {pendingGalleryFiles.map((item) => (
                  <div key={item.id} className="relative">
                    {item.isPdf
                      ? <div className="grid h-20 w-24 place-items-center rounded-md bg-white/[0.05] pr-7 text-xs text-zinc-300 ring-1 ring-white/[0.07]">PDF</div>
                      : <img src={item.previewUrl} alt="" className="h-20 w-24 rounded-md object-cover" />}
                    <button
                      type="button"
                      onClick={() => removePendingGalleryFile(item.id)}
                      className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-md bg-zinc-950/85 text-zinc-300 transition hover:text-red-200"
                      aria-label="Remove selected gallery file"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AdminSoftPanel>
      )}
      </FormSection>

      <FormSection eyebrow="External gallery links" title="Linked media" description="Add posts, videos, gallery links, or live references without uploading the full media set.">
        <div>
          <h2 className="sr-only">Gallery Content</h2>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <Field label="Add external gallery link" value={externalUrl} onChange={setExternalUrl} />
          <button type="button" onClick={addSingleExternalUrl} className="inline-flex h-fit items-center justify-center gap-2 self-end rounded-md bg-white/[0.055] px-4 py-3 text-sm text-zinc-200 ring-1 ring-white/[0.08] hover:bg-white/[0.085]">
            <Plus size={16} /> Add link
          </button>
        </div>

        <label className="grid gap-2 text-sm text-zinc-300">
          Bulk paste external links, one per line
          <textarea className="min-h-24 rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45" value={bulkExternalUrls} onChange={(event) => setBulkExternalUrls(event.target.value)} />
        </label>
        <button type="button" onClick={addBulkExternalUrls} className="w-fit rounded-md bg-white/[0.055] px-4 py-2 text-sm text-zinc-200 ring-1 ring-white/[0.08] hover:bg-white/[0.085]">
          Add pasted links
        </button>

        {externalItems.length > 0 && (
          <div className="grid gap-4 pt-2">
            {externalItems.map((item, index) => (
              <ExternalGalleryItemEditor
                key={item.id}
                item={item}
                index={index}
                total={externalItems.length}
                saving={saving || uploadingImages}
                onChange={(patch) => updateExternalItem(item.id, patch)}
                onUploadThumbnail={(file) => uploadExternalItemThumbnail(item, file)}
                onMove={moveExternalItem}
                onRemove={removeExternalItem}
              />
            ))}
          </div>
        )}
      </FormSection>

      <FormSection eyebrow="Publishing and links" title="Project destinations" description="Add optional public destinations and tune how this project appears.">
      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Video URL" value={form.video_url || ''} onChange={(value) => update('video_url', value)} />
        <Field label="Social media post URL" value={form.social_post_url || ''} onChange={(value) => update('social_post_url', value)} />
        <Field label="Live project URL" value={form.live_url || ''} onChange={(value) => update('live_url', value)} />
        <Field label="GitHub URL" value={form.github_url || ''} onChange={(value) => update('github_url', value)} />
        <Field label="Project date" type="date" value={form.project_date || ''} onChange={(value) => update('project_date', value)} />
        <AdminCheckbox label="Featured project" checked={form.featured} onChange={(value) => update('featured', value)} />
      </div>
      </FormSection>

      <FormSection eyebrow="Review workflow" title="Approval status" description="Submit drafts for review, approve finished work, or publish when it is ready for the public site.">
        <div className="grid gap-5 lg:grid-cols-2">
          <label className="grid gap-2 text-sm text-zinc-300">
            Review status
            <select className="rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45 disabled:cursor-not-allowed disabled:opacity-60" value={form.review_status || 'draft'} onChange={(event) => update('review_status', event.target.value)} disabled={!canApprove}>
              <option value="draft">draft</option>
              <option value="pending_review">pending review</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm text-zinc-300 lg:col-span-2">
            Review notes
            <textarea className="min-h-24 rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45" value={form.review_notes || ''} onChange={(event) => update('review_notes', event.target.value)} placeholder="Optional internal note for the team" />
          </label>
        </div>
      </FormSection>

      {creativeMembers.length > 0 && (
        <FormSection eyebrow="Contributors" title="Project contributors" description="Assign one or more creatives who handled this work.">
          <div>
            <h2 className="sr-only">Project Contributors</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {creativeMembers.map((creative) => (
              <div key={creative.id} className="rounded-md bg-zinc-950/55 p-3 text-sm text-zinc-300 ring-1 ring-white/[0.07]">
                <label className="flex items-center gap-3">
                <input type="checkbox" checked={selectedCreativeIds.includes(creative.id)} onChange={() => toggleCreative(creative.id)} className="h-4 w-4 accent-amber-300" />
                <span>{creative.name} <span className="text-zinc-500">/ {creative.role}</span></span>
                </label>
                {selectedCreativeIds.includes(creative.id) && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                    <label className="grid gap-2 text-xs text-zinc-400">
                      Credit role
                      <select className="rounded-md bg-zinc-950/70 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/[0.08] focus:ring-amber-200/45" value={contributorDetails[creative.id]?.role || 'Contributor'} onChange={(event) => updateContributor(creative.id, { role: event.target.value })}>
                        {contributorRoles.map((contributorRole) => <option key={contributorRole} value={contributorRole}>{contributorRole}</option>)}
                      </select>
                    </label>
                    <Field label="Order" type="number" value={contributorDetails[creative.id]?.displayOrder ?? ''} onChange={(value) => updateContributor(creative.id, { displayOrder: value })} />
                    <label className="inline-flex items-center gap-2 rounded-md bg-white/[0.045] px-3 py-2 text-xs text-zinc-300 ring-1 ring-white/[0.07]">
                      <input type="checkbox" checked={contributorDetails[creative.id]?.isPrimary === true} onChange={(event) => updateContributor(creative.id, { isPrimary: event.target.checked })} className="h-4 w-4 accent-amber-300" />
                      Primary
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
        </FormSection>
      )}

      <div className="sticky bottom-4 z-10 flex flex-wrap gap-3 rounded-lg bg-zinc-950/92 p-3  ring-1 ring-white/[0.08]">
        {canEditCurrent && (
        <button disabled={saving || uploadingImages} onClick={() => { submitActionRef.current = 'save'; }} className="inline-flex items-center gap-2 rounded-md bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60">
          <Save size={17} /> {saving && pendingGalleryFiles.length ? 'Uploading gallery...' : saving ? 'Saving...' : uploadingImages ? 'Uploading...' : 'Save project'}
        </button>
        )}
        {canEditCurrent && !canApprove && (
          <button disabled={saving || uploadingImages} onClick={() => { submitActionRef.current = 'submit'; }} className="inline-flex items-center gap-2 rounded-md bg-white/[0.055] px-5 py-3 text-sm font-semibold text-zinc-200 ring-1 ring-white/[0.08] hover:bg-white/[0.085] disabled:opacity-60">
            Submit for review
          </button>
        )}
        {canApprove && (
          <>
            <button disabled={saving || uploadingImages} onClick={() => { submitActionRef.current = 'approve'; }} className="rounded-md bg-emerald-300/12 px-5 py-3 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-300/20 hover:bg-emerald-300/16 disabled:opacity-60">Approve</button>
            <button disabled={saving || uploadingImages} onClick={() => { submitActionRef.current = 'reject'; }} className="rounded-md bg-red-300/10 px-5 py-3 text-sm font-semibold text-red-100 ring-1 ring-red-300/20 hover:bg-red-300/14 disabled:opacity-60">Reject</button>
            <button disabled={saving || uploadingImages} onClick={() => { submitActionRef.current = 'publish'; }} className="rounded-md bg-white/[0.055] px-5 py-3 text-sm font-semibold text-zinc-100 ring-1 ring-white/[0.08] hover:bg-white/[0.085] disabled:opacity-60">Publish</button>
            <button disabled={saving || uploadingImages} onClick={() => { submitActionRef.current = 'archive'; }} className="rounded-md bg-white/[0.035] px-5 py-3 text-sm font-semibold text-zinc-300 ring-1 ring-white/[0.07] hover:bg-white/[0.065] disabled:opacity-60">Archive</button>
          </>
        )}
        <button type="button" onClick={() => navigate('/admin/projects')} className="rounded-md bg-white/[0.055] px-5 py-3 text-sm text-zinc-200 ring-1 ring-white/[0.08] hover:bg-white/[0.085]">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ExternalGalleryItemEditor({ item, index, total, saving, onChange, onUploadThumbnail, onMove, onRemove }) {
  return (
    <AdminSoftPanel className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-zinc-300">
          <span className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-400">#{index + 1}</span>
          <span>{item.platform || platformLabel(item.type)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={index === 0 || saving} onClick={() => onMove(item.id, -1)} className="grid h-9 w-9 place-items-center rounded-md bg-white/[0.055] text-zinc-300 ring-1 ring-white/[0.08] disabled:opacity-40 hover:text-amber-200" aria-label="Move link up">
            <ArrowUp size={15} />
          </button>
          <button type="button" disabled={index === total - 1 || saving} onClick={() => onMove(item.id, 1)} className="grid h-9 w-9 place-items-center rounded-md bg-white/[0.055] text-zinc-300 ring-1 ring-white/[0.08] disabled:opacity-40 hover:text-amber-200" aria-label="Move link down">
            <ArrowDown size={15} />
          </button>
          <button type="button" disabled={saving} onClick={() => onRemove(item.id)} className="inline-flex items-center gap-2 rounded-md bg-red-400/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-300/20 hover:bg-red-500/10">
            <Trash2 size={15} /> Remove
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="URL" value={item.url || ''} onChange={(value) => onChange({ url: value })} />
        <label className="grid gap-2 text-sm text-zinc-300">
          Platform
          <select className="rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45" value={item.type || 'external_link'} onChange={(event) => onChange({ type: event.target.value })}>
            {galleryItemTypes.map((type) => <option key={type} value={type}>{platformLabel(type)}</option>)}
          </select>
        </label>
        <Field label="Optional title" value={item.title || ''} onChange={(value) => onChange({ title: value })} />
        <Field label="Thumbnail URL" value={item.thumbnail_url || ''} onChange={(value) => onChange({ thumbnail_url: value, thumbnail_storage_path: '' })} />
      </div>

      <label className="grid gap-2 text-sm text-zinc-300">
        Optional description
        <textarea className="min-h-20 rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45" value={item.description || ''} onChange={(event) => onChange({ description: event.target.value })} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-white/[0.055] px-3 py-2 text-sm text-zinc-200 ring-1 ring-white/[0.08] hover:bg-white/[0.085]">
          <Upload size={15} /> Upload thumbnail
          <input className="sr-only" type="file" accept="image/*" onChange={(event) => {
            onUploadThumbnail(event.target.files?.[0]);
            event.target.value = '';
          }} />
        </label>
        <span className="text-xs text-zinc-500">Large thumbnails are resized to 800px and optimized to 300 KB.</span>
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-amber-200">
            <ExternalLink size={15} /> Open source
          </a>
        )}
      </div>

      {item.thumbnail_url && (
        <img src={item.thumbnail_url} alt="" className="h-24 max-w-48 rounded-md object-cover" />
      )}
    </AdminSoftPanel>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, onBlur }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45"
      />
    </label>
  );
}

function FormSection({ eyebrow, title, description, children }) {
  return (
    <AdminSurface className="grid gap-5">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{eyebrow}</p>
        <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
        {description && <p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p>}
      </div>
      {children}
    </AdminSurface>
  );
}


