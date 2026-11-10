import React, { useState } from 'react';
import { Building2, Plus, Trash2, X, Check, Key, Phone, Save } from 'lucide-react';

export function BusinessManagerModal({ isOpen, onClose, businesses, onSave }) {
  const [list, setList] = useState(businesses || []);
  const [isSaving, setIsSaving] = useState(false);

  // Sync with prop when modal opens
  React.useEffect(() => {
    if (businesses) setList(businesses);
  }, [businesses, isOpen]);

  if (!isOpen) return null;

  const handleUpdate = (idx, field, value) => {
    const updated = [...list];
    updated[idx] = { ...updated[idx], [field]: value };
    setList(updated);
  };

  const handleAdd = () => {
    setList([
      ...list,
      {
        id: `biz-${Date.now()}`,
        name: 'New Business',
        phoneNumber: '+91',
        phoneNumberId: '',
        color: 'emerald'
      }
    ]);
  };

  const handleRemove = (idx) => {
    setList(list.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(list);
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Business Directory & Phone Number IDs</h2>
              <p className="text-xs text-slate-400">Map inbound calls and Phone Number IDs for each tenant</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Business List */}
        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {list.map((biz, idx) => (
            <div
              key={biz.id || idx}
              className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  value={biz.name}
                  onChange={(e) => handleUpdate(idx, 'name', e.target.value)}
                  placeholder="Business Name (e.g. Zangos)"
                  className="bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-semibold text-white focus:border-emerald-500 outline-none w-1/2"
                />

                <div className="flex items-center gap-2">
                  <select
                    value={biz.color || 'emerald'}
                    onChange={(e) => handleUpdate(idx, 'color', e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none"
                  >
                    <option value="emerald">Emerald</option>
                    <option value="indigo">Indigo</option>
                    <option value="amber">Amber</option>
                    <option value="blue">Blue</option>
                    <option value="purple">Purple</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title="Remove Business"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Phone Number */}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-emerald-400" />
                    <span>WhatsApp Phone Number (DID)</span>
                  </label>
                  <input
                    type="text"
                    value={biz.phoneNumber}
                    onChange={(e) => handleUpdate(idx, 'phoneNumber', e.target.value)}
                    placeholder="+919544383237"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-emerald-400 focus:border-emerald-500 outline-none"
                  />
                </div>

                {/* Phone Number ID */}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                    <Key className="w-3 h-3 text-teal-400" />
                    <span>Meta Phone Number ID</span>
                  </label>
                  <input
                    type="text"
                    value={biz.phoneNumberId}
                    onChange={(e) => handleUpdate(idx, 'phoneNumberId', e.target.value)}
                    placeholder="e.g. 1253960817805789"
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-slate-200 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors border border-slate-700"
          >
            <Plus className="w-4 h-4" />
            <span>Add Business</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-xs font-semibold text-white transition-all shadow-lg shadow-emerald-500/20"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Directory'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

