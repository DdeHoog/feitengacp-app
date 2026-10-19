import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../api';
import { fmtDay, todayISO } from '../dates';
import { imageUrl, checkImageFile, hostOf, linkLabel, IMAGE_TYPES, IMAGE_MAX_MB } from '../news';

const errMsg = (err, fallback) => err.response?.data?.error || fallback;
const ACCEPT = IMAGE_TYPES.join(',');

const fieldsOf = (item) => (item
    ? { title: item.title, body: item.body, link_url: item.link_url || '', published_at: item.published_at, visible: !!item.visible, pinned: !!item.pinned }
    : { title: '', body: '', link_url: '', published_at: todayISO(), visible: true, pinned: false });

// Create / edit one item. The text fields save first (POST or PUT), then the image goes up as
// the bare file (PUT, its own Content-Type) or is removed (DELETE) — two requests because an
// image doesn't fit in JSON. `id` is remembered after a create so a failed image upload can
// be retried without creating the item twice.
function NewsForm({ item, onSaved, onCancel }) {
    const [form, setForm] = useState(() => fieldsOf(item));
    const [id, setId] = useState(item?.id ?? null);
    const [file, setFile] = useState(null);         // newly chosen image
    const [preview, setPreview] = useState(null);   // object URL for `file`
    const [removeImage, setRemoveImage] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!file) { setPreview(null); return undefined; }
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const set = (k) => (e) => {
        const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm((f) => ({ ...f, [k]: v }));
    };

    const pickFile = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const problem = checkImageFile(f);
        e.target.value = ''; // so choosing the same file again re-fires onChange
        if (problem) { setError(problem); return; }
        setError(null);
        setFile(f);
        setRemoveImage(false);
    };

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        let saved;
        try {
            saved = id
                ? (await apiClient.put(`/api/admin/news/${id}`, form)).data
                : (await apiClient.post('/api/admin/news', form)).data;
            setId(saved.id);
        } catch (err) {
            setError(errMsg(err, 'Saving failed.'));
            setSaving(false);
            return;
        }
        try {
            if (file) {
                saved = (await apiClient.put(`/api/admin/news/${saved.id}/image`, file, { headers: { 'Content-Type': file.type } })).data;
            } else if (removeImage && item?.image_v) {
                saved = (await apiClient.delete(`/api/admin/news/${saved.id}/image`)).data;
            }
        } catch (err) {
            setError(`The text was saved, but the image was not: ${errMsg(err, 'upload failed')} — fix it and save again.`);
            setSaving(false);
            return;
        }
        onSaved(saved);
    };

    const current = !file && !removeImage && item?.image_v ? imageUrl(item) : null;

    return (
        <form onSubmit={submit} className="border border-[#004EA2] rounded-md p-4 bg-blue-50/40 text-sm">
            <h3 className="font-semibold text-gray-900 mb-3">{id ? 'Edit news item' : 'New news item'}</h3>
            {error && <p className="mb-3 p-2 rounded bg-red-100 text-red-800 border border-red-300">{error}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-6 gap-y-3">
                <label className="block">
                    <span className="block text-gray-700 font-semibold mb-1">Title</span>
                    <input type="text" value={form.title} onChange={set('title')} required maxLength={200} className="border border-gray-300 rounded px-2 py-1 w-full" />
                </label>
                <label className="block">
                    <span className="block text-gray-700 font-semibold mb-1">Date on the item</span>
                    <input type="date" value={form.published_at} onChange={set('published_at')} required className="border border-gray-300 rounded px-2 py-1" />
                    <span className="block text-xs text-gray-500 mt-1">Printed with the item and used for the order — not a schedule.</span>
                </label>
            </div>

            <label className="block mt-3">
                <span className="block text-gray-700 font-semibold mb-1">Text <span className="font-normal text-gray-500">(optional — line breaks are kept)</span></span>
                <textarea value={form.body} onChange={set('body')} rows={6} maxLength={5000} className="border border-gray-300 rounded px-2 py-1 w-full" />
            </label>

            <label className="block mt-3">
                <span className="block text-gray-700 font-semibold mb-1">Link <span className="font-normal text-gray-500">(optional — opens in a new tab; shown as {form.link_url.trim() ? `“${linkLabel(form.link_url.trim())}”` : '“Visit <site>” or “Watch on YouTube”'})</span></span>
                <input type="url" value={form.link_url} onChange={set('link_url')} placeholder="https://…" maxLength={500} className="border border-gray-300 rounded px-2 py-1 w-full" />
            </label>

            <div className="mt-3">
                <span className="block text-gray-700 font-semibold mb-1">Image / banner <span className="font-normal text-gray-500">(optional — jpeg, png, webp or gif, max {IMAGE_MAX_MB} MB)</span></span>
                {(current || preview) && (
                    <div className="mb-2 flex items-start gap-3">
                        <img src={preview || current} alt="" className="max-h-32 w-auto rounded border border-gray-200" />
                        {preview
                            ? <button type="button" onClick={() => setFile(null)} className="text-[#004EA2] hover:underline">Undo</button>
                            : <button type="button" onClick={() => setRemoveImage(true)} className="text-red-700 hover:underline">Remove image</button>}
                    </div>
                )}
                {removeImage && !file && <p className="mb-2 text-gray-600">The image will be removed when you save. <button type="button" onClick={() => setRemoveImage(false)} className="text-[#004EA2] hover:underline">Keep it</button></p>}
                <input type="file" accept={ACCEPT} onChange={pickFile} className="block" />
            </div>

            {/* No "visible" box here: a new item shows at once, Hide in the list takes it off —
                one switch, one place (the box's old "on the login page" wording got it unticked). */}
            <div className="mt-3">
                <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={form.pinned} onChange={set('pinned')} /> Pin to the top
                </label>
            </div>

            <div className="mt-4 flex gap-3">
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-[#003F84] text-white font-semibold shadow hover:bg-[#00457F] disabled:opacity-60">
                    {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50">
                    Cancel
                </button>
            </div>
        </form>
    );
}

// Admin "News" tab: every item (hidden ones too), the order the home page uses — pinned
// first, then newest date. Show/Hide and Pin/Unpin act at once; Edit opens the form in place.
function NewsAdmin() {
    const [items, setItems] = useState(null);
    const [error, setError] = useState(null);
    const [editing, setEditing] = useState(null); // null | 'new' | item id

    const load = useCallback(() => {
        apiClient.get('/api/admin/news')
            .then((res) => { setItems(res.data); setError(null); })
            .catch((err) => setError(errMsg(err, 'Failed to load news.')));
    }, []);
    useEffect(() => { load(); }, [load]);

    const saved = () => { setEditing(null); load(); };

    const toggle = async (n, field) => {
        try {
            const res = await apiClient.put(`/api/admin/news/${n.id}`, { ...n, [field]: !n[field] });
            setItems((list) => list.map((i) => (i.id === n.id ? res.data : i)));
            load(); // order may have changed (pin)
        } catch (err) {
            setError(errMsg(err, 'Update failed.'));
        }
    };

    const remove = async (n) => {
        if (!window.confirm(`Delete “${n.title}”? This cannot be undone.`)) return;
        try {
            await apiClient.delete(`/api/admin/news/${n.id}`);
            setItems((list) => list.filter((i) => i.id !== n.id));
        } catch (err) {
            setError(errMsg(err, 'Delete failed.'));
        }
    };

    return (
        <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <h2 className="text-lg font-semibold text-gray-800">
                    News {items && <span className="text-sm font-normal text-gray-500">({items.length} item{items.length !== 1 ? 's' : ''}, {items.filter((n) => n.visible).length} visible)</span>}
                </h2>
                {editing === null && (
                    <button onClick={() => setEditing('new')} className="px-3 py-1.5 rounded-md bg-[#003F84] text-white text-sm font-semibold shadow hover:bg-[#00457F]">
                        + New item
                    </button>
                )}
            </div>
            <p className="text-sm text-gray-500 mb-4">Items appear on the home page after login as soon as they are saved — pinned ones first, then by date, newest on top. Use Hide to take one off without deleting it.</p>

            {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
            {items === null && !error && <p className="text-gray-600">Loading…</p>}

            {editing === 'new' && <div className="mb-4"><NewsForm item={null} onSaved={saved} onCancel={() => setEditing(null)} /></div>}

            {items && items.length === 0 && editing !== 'new' && <p className="text-sm text-gray-600">No news yet — “New item” adds the first.</p>}

            <div className="space-y-3">
                {(items || []).map((n) => (
                    editing === n.id ? (
                        <NewsForm key={n.id} item={n} onSaved={saved} onCancel={() => setEditing(null)} />
                    ) : (
                        <div key={n.id} className={`flex items-start gap-3 border rounded-md px-4 py-3 ${n.visible ? 'border-gray-200' : 'border-dashed border-gray-300 bg-gray-50'}`}>
                            {imageUrl(n)
                                ? <img src={imageUrl(n)} alt="" className="w-20 h-14 object-cover rounded flex-shrink-0 border border-gray-200" />
                                : <div className="w-20 h-14 rounded bg-gray-100 text-xs text-gray-400 flex items-center justify-center flex-shrink-0">no image</div>}
                            <div className="flex-1 min-w-0 text-sm">
                                <p className="font-semibold text-gray-900 truncate">{n.title}</p>
                                <p className="text-gray-500">
                                    {fmtDay(n.published_at)}
                                    {!n.visible && <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-gray-200 text-gray-700">hidden</span>}
                                    {!!n.pinned && <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-800">pinned</span>}
                                    {n.link_url && <span className="ml-2 text-xs">· link → {hostOf(n.link_url) || n.link_url}</span>}
                                </p>
                                {n.body && <p className="text-gray-600 truncate">{n.body}</p>}
                            </div>
                            <div className="flex gap-3 text-sm whitespace-nowrap">
                                <button onClick={() => toggle(n, 'visible')} className="text-[#004EA2] hover:underline">{n.visible ? 'Hide' : 'Show'}</button>
                                <button onClick={() => toggle(n, 'pinned')} className="text-[#004EA2] hover:underline">{n.pinned ? 'Unpin' : 'Pin'}</button>
                                <button onClick={() => setEditing(n.id)} className="text-[#004EA2] hover:underline">Edit</button>
                                <button onClick={() => remove(n)} className="text-red-700 hover:underline">Delete</button>
                            </div>
                        </div>
                    )
                ))}
            </div>
        </div>
    );
}

export default NewsAdmin;
