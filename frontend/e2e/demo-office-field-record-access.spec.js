import { expect, test } from '@playwright/test';

const PASSWORD = process.env.GOVECTOR_E2E_PASSWORD;
if (!PASSWORD) {
  throw new Error('GOVECTOR_E2E_PASSWORD est obligatoire pour le test dossier terrain bureau.');
}

const OFFICE_USERS = [
  {
    role: 'ADMIN',
    username: process.env.GOVECTOR_E2E_ADMIN_USERNAME || 'admin.govector',
  },
  {
    role: 'ORIENTEUR',
    username: process.env.GOVECTOR_E2E_ORIENTEUR_USERNAME || 'orienteur.casablanca',
  },
];

async function officeSession(request, { username, role }) {
  const login = await request.post('/api/v1/auth/login', {
    form: { username, password: PASSWORD },
  });

  expect(login.status(), `Connexion Web impossible pour ${username}: ${await login.text()}`).toBe(200);
  const payload = await login.json();
  expect(payload.access_token, `Token absent pour ${username}`).toBeTruthy();
  expect(String(payload.user?.role || '').toUpperCase(), `Rôle inattendu pour ${username}`).toBe(role);

  return {
    Authorization: `Bearer ${payload.access_token}`,
  };
}

test.describe('GoVector — dossier terrain visible au bureau', () => {
  for (const account of OFFICE_USERS) {
    test(`${account.role} peut lire le dossier terrain d’une intervention de son périmètre`, async ({ request }) => {
      const headers = await officeSession(request, account);

      const jobsResponse = await request.get('/api/v1/jobs/?limit=500', { headers });
      expect(jobsResponse.status(), `Liste interventions refusée pour ${account.username}: ${await jobsResponse.text()}`).toBe(200);

      const jobsPayload = await jobsResponse.json();
      const jobs = Array.isArray(jobsPayload) ? jobsPayload : jobsPayload.items || [];
      expect(jobs.length, `Aucune intervention accessible à ${account.username} pour tester le dossier terrain`).toBeGreaterThan(0);

      const jobId = Number(jobs[0]?.id);
      expect(Number.isInteger(jobId) && jobId > 0, `Identifiant intervention invalide pour ${account.username}`).toBeTruthy();

      const fieldResponse = await request.get(
        `/api/v1/job-actions/${jobId}/field-record`,
        { headers },
      );
      expect(
        fieldResponse.status(),
        `Dossier terrain refusé pour ${account.username} sur l’intervention ${jobId}: ${await fieldResponse.text()}`,
      ).toBe(200);

      const fieldRecord = await fieldResponse.json();
      expect(Number(fieldRecord.job_id)).toBe(jobId);
      expect(Array.isArray(fieldRecord.field_actions), 'field_actions doit être exposé au bureau').toBeTruthy();
      expect(Array.isArray(fieldRecord.technician_media), 'technician_media doit être exposé au bureau').toBeTruthy();
      expect(Array.isArray(fieldRecord.visits), 'visits doit être exposé au bureau').toBeTruthy();
    });
  }
});
