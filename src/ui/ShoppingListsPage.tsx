import React from 'react';
import type { User } from '@supabase/supabase-js';

interface ShoppingListsPageProps {
  user: User;
  profile: any;
  showAdmin?: boolean;
  onNavigate: (nav: any) => void;
  onLogout: () => void;
  onOpenRoom?: (roomId: string) => void;
  onOpenChecklist?: (roomId: string) => void;
}

export function ShoppingListsPage({
  user,
  profile,
  showAdmin,
  onNavigate,
  onLogout,
}: ShoppingListsPageProps) {
  return (
    <div className="shopping-lists-page">
      <header className="shopping-lists-page__header">
        <h1>Shopping Lists</h1>
        <p>Your saved shopping lists will appear here.</p>
      </header>
      <div className="shopping-lists-page__content">
        <p>No lists yet. Start designing a room to create your first shopping list!</p>
        <button
          onClick={() => onNavigate({ screen: 'dashboard' })}
          className="button button--primary"
        >
          Go to Rooms
        </button>
      </div>
    </div>
  );
}
