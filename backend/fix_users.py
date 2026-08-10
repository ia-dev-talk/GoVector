"""
fix_users.py — Supprime puis recrée UNIQUEMENT les comptes utilisateurs.
Ne touche PAS aux tables technicians, orienteurs, secteurs, jobs, etc.
Idempotent : peut être exécuté plusieurs fois sans effet de bord.
"""
import asyncio
import sys

sys.path.insert(0, '.')

from database.connection import AsyncSessionLocal
from database.models import User, Technician, Orienteur, UserRole
from auth.security import get_password_hash
from sqlalchemy import select, text

PASSWORD = get_password_hash("mdp123")

# ─── Comptes à créer ──────────────────────────────────────────────
ACCOUNTS = [
    # (username, email, role, orienteur_name_for_lookup)
    ("admin", "admin@fieldopt.ma", UserRole.ADMIN, None),
    ("chef", "chef.orienteur@fieldopt.ma", UserRole.CHEF_ORIENTEUR, None),
    ("wahid", "wahid.benali@fieldopt.ma", UserRole.ORIENTEUR, "Wahid Benali"),
    ("rachid", "rachid.elfassi@fieldopt.ma", UserRole.ORIENTEUR, "Rachid El Fassi"),
    ("driss", "driss.elomari@fieldopt.ma", UserRole.ORIENTEUR, "Driss El Omari"),
    ("hicham", "hicham.tazi@fieldopt.ma", UserRole.ORIENTEUR, "Hicham Tazi"),
]

# ─── Comptes techniciens à recréer ──────────────────────────────
TECH_USERNAMES = [
    "amine.benali",
    "youssef.elamrani",
    "karim.tazi",
]


async def fix_users():
    async with AsyncSessionLocal() as session:
        print("=" * 70)
        print("🔧 FIX USERS — Recréation ciblée des comptes utilisateurs")
        print("=" * 70)

        # ── Étape 1 : Vérifier l'état actuel ─────────────────
        print("\n📋 ÉTAT ACTUEL DES USERS :")
        result = await session.execute(select(User).order_by(User.id))
        existing_users = result.scalars().all()
        if existing_users:
            print(f"  {'ID':<4} {'Username':<20} {'Role':<18} {'TechID':<8} {'OriID':<6}")
            print(f"  {'-'*56}")
            for u in existing_users:
                print(f"  {u.id:<4} {u.username:<20} {u.role.value:<18} {str(u.technician_id or ''):<8} {str(u.orienteur_id or ''):<6}")
        else:
            print("  (aucun utilisateur)")

        # ── Étape 2 : Supprimer les anciens comptes ──────────
        print("\n🗑️ SUPPRESSION DES ANCIENS COMPTES...")
        deleted_count = 0

        for username, email, role, ori_name in ACCOUNTS:
            existing = await session.execute(
                select(User).where(
                    (User.username == username) | (User.email == email)
                )
            )
            user = existing.scalar_one_or_none()
            if user:
                await session.delete(user)
                deleted_count += 1
                print(f"  ✕ Supprimé : {username} (id={user.id})")

        for tech_username in TECH_USERNAMES:
            existing = await session.execute(
                select(User).where(User.username == tech_username)
            )
            user = existing.scalar_one_or_none()
            if user:
                await session.delete(user)
                deleted_count += 1
                print(f"  ✕ Supprimé : {tech_username} (id={user.id})")

        await session.commit()

        if deleted_count == 0:
            print("  (aucun ancien compte à supprimer)")
        else:
            print(f"  ✅ {deleted_count} compte(s) supprimé(s)")

        # ── Étape 3 : Créer les comptes orienteurs + admin/chef ──
        print("\n✨ CRÉATION DES COMPTES...")

        # Récupérer les orienteurs existants pour créer les liens
        result = await session.execute(select(Orienteur))
        orienteurs = result.scalars().all()
        orienteur_name_map = {o.name: o.id for o in orienteurs}

        created_count = 0
        for username, email, role, ori_name in ACCOUNTS:
            orienteur_id = orienteur_name_map.get(ori_name) if ori_name else None

            user = User(
                username=username,
                email=email,
                password_hash=PASSWORD,
                role=role,
                is_active=True,
                orienteur_id=orienteur_id,
            )
            session.add(user)
            created_count += 1
            orienteur_info = f" → orienteur_id={orienteur_id}" if orienteur_id else ""
            print(f"  ✓ Créé : {username:<12} | {role.value:<18} {orienteur_info}")

        await session.commit()
        print(f"  ✅ {created_count} compte(s) créé(s)")

        # ── Étape 4 : Créer les comptes techniciens ──────────────
        print("\n👷 CRÉATION DES COMPTES TECHNICIENS...")

        # Récupérer les techniciens par email
        tech_accounts = [
            ("amine.benali", "amine.benali@fieldopt.ma"),
            ("youssef.elamrani", "youssef.elamrani@fieldopt.ma"),
            ("karim.tazi", "karim.tazi@fieldopt.ma"),
        ]

        tech_created = 0
        for username, email in tech_accounts:
            # Trouver le technicien correspondant
            result = await session.execute(
                select(Technician).where(Technician.email == email)
            )
            tech = result.scalar_one_or_none()

            if not tech:
                print(f"  ⚠ Technicien introuvable pour {email}, recherche par nom...")
                # Fallback : chercher par le prénom dans le nom
                first_name = username.split(".")[0].capitalize()
                result = await session.execute(
                    select(Technician).where(Technician.name.ilike(f"{first_name}%"))
                )
                tech = result.scalar_one_or_none()

            if tech:
                user = User(
                    username=username,
                    email=email,
                    password_hash=PASSWORD,
                    role=UserRole.TECHNICIAN,
                    is_active=True,
                    technician_id=tech.id,
                )
                session.add(user)
                tech_created += 1
                print(f"  ✓ Créé : {username:<20} | TECHNICIAN | tech_id={tech.id} ({tech.name})")
            else:
                print(f"  ❌ Impossible de trouver le technicien pour {username}")

        await session.commit()
        print(f"  ✅ {tech_created} compte(s) technicien(s) créé(s)")

        # ── Étape 5 : Vérification finale ────────────────────────
        print("\n" + "=" * 70)
        print("📊 TABLEAU RÉCAPITULATIF")
        print("=" * 70)
        result = await session.execute(select(User).order_by(User.id))
        all_users = result.scalars().all()

        print(f"  {'ID':<4} {'Username':<22} {'Rôle':<18} {'TechID':<8} {'OriID':<6} {'Actif':<6}")
        print(f"  {'-'*64}")
        for u in all_users:
            print(f"  {u.id:<4} {u.username:<22} {u.role.value:<18} {str(u.technician_id or ''):<8} {str(u.orienteur_id or ''):<6} {'✅' if u.is_active else '❌'}")

        print(f"\n  Total : {len(all_users)} utilisateurs")
        print("\n✅ Fix terminé avec succès !")
        print("\n🔑 Comptes disponibles :")
        print("   admin / mdp123 → ADMIN")
        print("   chef / mdp123 → CHEF_ORIENTEUR")
        print("   wahid / mdp123 → ORIENTEUR")
        print("   rachid / mdp123 → ORIENTEUR")
        print("   driss / mdp123 → ORIENTEUR")
        print("   hicham / mdp123 → ORIENTEUR")
        print("   amine.benali / mdp123 → TECHNICIAN")
        print("   youssef.elamrani / mdp123 → TECHNICIAN")
        print("   karim.tazi / mdp123 → TECHNICIAN")


if __name__ == "__main__":
    asyncio.run(fix_users())
