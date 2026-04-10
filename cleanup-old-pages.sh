#!/bin/bash
# Script de nettoyage pour supprimer les anciennes pages doublons
echo "🗑️ Nettoyage des pages doublons..."

# Pages à supprimer (après vérification)
PAGES_TO_DELETE=(
  "app/briefs/page.tsx.bak"
  "app/publications/page.tsx.bak" 
  "app/brief/page.tsx.bak"
  "app/publications/[id]/page.tsx.bak"
  "app/(dashboard)"
)

for page in "${PAGES_TO_DELETE[@]}"; do
  if [ -f "$page" ]; then
    echo "Suppression de $page"
    rm -rf "$page"
  fi
done

echo "✅ Nettoyage terminé!"
