import React, { useState } from 'react';

interface AddToListModalProps {
  open: boolean;
  product: any;
  userId: string | null;
  activeRoomId: string | null;
  onClose: () => void;
  onRequestSignIn?: () => void;
  onAdded: (listId: string, syncedActiveRoom: boolean) => void;
}

export function AddToListModal({ open, product, onClose, onAdded }: AddToListModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('essentials');

  if (!open) return null;

  const handleSubmit = () => {
    if (name.trim()) {
      onAdded('temp-list-id', false);
      setName('');
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <header className="modal__header">
          <h2>Add Item to List</h2>
          <button className="modal__close" onClick={onClose}>×</button>
        </header>
        <div className="modal__body">
          <label>
            Item Name
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Desk Lamp"
            />
          </label>
          <label>
            Category
            <select value={category} onChange={e => setCategory(e.target.value)}>
              <option value="essentials">Essentials</option>
              <option value="decor">Decor</option>
              <option value="storage">Storage</option>
              <option value="bedding">Bedding</option>
            </select>
          </label>
        </div>
        <footer className="modal__footer">
          <button className="button" onClick={onClose}>Cancel</button>
          <button className="button button--primary" onClick={handleSubmit}>Add</button>
        </footer>
      </div>
    </div>
  );
}
