"""
Script pour réinitialiser tous les mots de passe utilisateurs en mode développement.
Version modifiée sans SQLAlchemy (utilise le driver natif asyncpg).
"""
import asyncio
import sys
from passlib.context import CryptContext
from backend.config import get_settings
import asyncpg  # Utilisé directement à la place de SQLAlchemy

# Configuration du hash bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Nouveau mot de passe
NEW_PASSWORD = "mdp123"

# Générer le hash du nouveau mot de passe
NEW_HASH = pwd_context.hash(NEW_PASSWORD)

print(f"🔐 Hash généré pour '{NEW_PASSWORD}':")
print(f"   {NEW_HASH}")
print()

async def reset_all_passwords():
    settings = get_settings()

    # Nettoyage de l'URL pour asyncpg
    db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://").replace("postgresql+psycopg2://", "postgresql://")

    try:
        # Connexion directe à PostgreSQL via asyncpg
        conn = await asyncpg.connect(db_url)

        # Compter le nombre d'utilisateurs
        user_count = await conn.fetchval("SELECT COUNT(*) FROM users")

        if not user_count or user_count == 0:
            print("⚠️  Aucun utilisateur trouvé dans la base de données.")
            await conn.close()
            return

        print(f"📊 {user_count} utilisateur(s) trouvé(s) dans la table 'users'")
        print()

        # Demander confirmation
        response = input(f"⚠️  Confirmer la réinitialisation des mots de passe pour {user_count} utilisateur(s) ? (oui/non) : ")
        if response.lower() not in ['oui', 'o', 'yes', 'y']:
            print("❌ Opération annulée.")
            await conn.close()
            return

        print()
        print("⏳ Mise à jour en cours...")

        # Exécution de la mise à jour (Syntaxe native asyncpg : $1 à la place de :hash)
        await conn.execute(
            "UPDATE users SET password_hash = $1, updated_at = NOW()",
            NEW_HASH
        )

        print(f"✅ {user_count} mot(s) de passe réinitialisé(s) avec succès !")
        print(f"   Nouveau mot de passe : {NEW_PASSWORD}")
        print()
        print("🔑 Vous pouvez maintenant vous connecter avec n'importe quel compte :")
        print(f"   ● Mot de passe : {NEW_PASSWORD}")

        await conn.close()

    except Exception as e:
        print(f"❌ Erreur lors de la mise à jour : {e}")
        sys.exit(1)

if __name__ == "__main__":
    print("=" * 60)
    print("🔧 Réinitialisation des mots de passe - FTTH Platform (Native)")
    print("=" * 60)
    print()
    asyncio.run(reset_all_passwords())