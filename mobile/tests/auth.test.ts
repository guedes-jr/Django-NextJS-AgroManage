import assert from 'node:assert/strict';
import { test } from 'node:test';
import { create, AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';
import { parseApiUrl, sessionStorageKey, legalUrls } from '../src/config/environment';
import { languages, messages, resolveLanguage } from '../src/i18n/messages';
import { credentialsSchema, registrationSchema, newPasswordSchema, organizationSchema, tokensSchema, userSchema, type Tokens } from '../src/features/auth/contracts';
import { SessionController, type TokenVault } from '../src/features/auth/sessionController';
import { AuthFailure, RegistrationFailure, authError, registrationError, createAuthApi, type AuthApi } from '../src/services/authApi';

const tokens = { access: 'synthetic-access', refresh: 'synthetic-refresh' };
const user = userSchema.parse({ id: 'user-1', full_name: 'Pessoa de teste', email: 'test@example.com', force_password_change: false,
  is_platform_staff: false, affiliate_portal_only: false, access: { role: 'operator', can_manage_users: false,
    can_view_financial: false, can_operate_crops: false, livestock_species: ['bovinos'], read_only: false } });
const organization = { id: 'org-1', name: 'Organização de teste', language: 'es' as const };
function fixture(overrides: Partial<AuthApi> = {}) {
  let saved: Tokens | null = null;
  let revokeCount = 0;
  const api: AuthApi = {followUpOptions:async()=>{throw Error('unused');},followUpExecutions:async()=>{throw Error('unused');},resolveFollowUp:async()=>{throw Error('unused');},
sanitaryOptions:async()=>{throw Error('unused');},sanitaryAnimals:async()=>{throw Error('unused');},createCollectiveMedication:async()=>{throw Error('unused');},createSanitary:async()=>{throw Error('unused');},
reviewCollectiveMedication:async()=>{throw Error('unused');},confirmCollectiveMedication:async()=>{throw Error('unused');},
reviewSanitary:async()=>{throw Error('unused');},confirmSanitary:async()=>{throw Error('unused');},
collectiveMedicationEdit:async()=>{throw Error('unused');},updateCollectiveMedication:async()=>{throw Error('unused');},cancelCollectiveMedication:async()=>{throw Error('unused');},
sanitaryEdit:async()=>{throw Error('unused');},updateSanitary:async()=>{throw Error('unused');},cancelSanitary:async()=>{throw Error('unused');},
castrationEdit:async()=>{throw Error("not configured");},updateCastration:async()=>{throw Error("not configured");},cancelCastration:async()=>{throw Error("not configured");},reviewCastration:async()=>{throw Error("not configured");},confirmCastration:async()=>{throw Error("not configured");},castrationOptions:async()=>{throw Error("not configured");},castrationAnimals:async()=>{throw Error("not configured");},createCastration:async()=>{throw Error("not configured");},weighingEdit:async()=>{throw Error("not configured");},updateWeighing:async()=>{throw Error("not configured");},cancelWeighing:async()=>{throw Error("not configured");},reviewWeighing:async()=>{throw Error("not configured");},confirmWeighing:async()=>{throw Error("not configured");},weighingOptions:async()=>{throw Error("not configured");},weighingAnimals:async()=>{throw Error("not configured");},createWeighing:async()=>{throw Error("not configured");},classificationOptions:async()=>{throw Error('unused');},classificationTargets:async()=>{throw Error('unused');},previewClassification:async()=>{throw Error('unused');},confirmClassification:async()=>{throw Error('unused');},
cattleOccurrenceOptions:async()=>{throw Error('unused');},cattleOccurrenceMembers:async()=>{throw Error('unused');},cattleOccurrenceTargets:async()=>{throw Error('unused');},createCattleOccurrence:async()=>{throw Error('unused');},cattleOccurrenceResolutionOptions:async()=>{throw Error('unused');},resolveCattleOccurrence:async()=>{throw Error('unused');},
previewProtocolTemplate:async()=>{throw Error('unused');},confirmProtocolTemplate:async()=>{throw Error('unused');},
protocolSemenMatings:async()=>{throw Error('unused');},protocolSemenLots:async()=>{throw Error('unused');},previewProtocolSemen:async()=>{throw Error('unused');},confirmProtocolSemen:async()=>{throw Error('unused');},
protocolExecutionOptions:async()=>{throw Error('unused');},previewProtocolExecution:async()=>{throw Error('unused');},confirmProtocolExecution:async()=>{throw Error('unused');},
protocolStartOptions:async()=>{throw Error('unused');},protocolStartAnimals:async()=>{throw Error('unused');},previewProtocolStart:async()=>{throw Error('unused');},confirmProtocolStart:async()=>{throw Error('unused');},
cattleProtocols:async()=>{throw Error('unused');},cattleProtocol:async()=>{throw Error('unused');},
cattleOperations:async()=>{throw Error('unused');},cattleOperation:async()=>{throw Error('unused');},
managements:async()=>{throw Error("not configured");},management:async()=>{throw Error("not configured");},managementParticipants:async()=>{throw Error("not configured");},pastureFormOptions:async()=>{throw Error("not configured");},pastureFormRecord:async()=>{throw Error("not configured");},savePasture:async()=>{throw Error("not configured");},grazingTransferOptions:async()=>{throw Error('unused');},grazingTransferDestinations:async()=>{throw Error('unused');},previewGrazingTransfer:async()=>{throw Error('unused');},confirmGrazingTransfer:async()=>{throw Error('unused');},
grazingExitOptions:async()=>{throw Error("not configured");},previewGrazingExit:async()=>{throw Error("not configured");},confirmGrazingExit:async()=>{throw Error("not configured");},grazingEntryOptions:async()=>{throw Error("not configured");},grazingEntryBatches:async()=>{throw Error("not configured");},previewGrazingEntry:async()=>{throw Error("not configured");},confirmGrazingEntry:async()=>{throw Error("not configured");},grazings:async()=>{throw Error("not configured");},grazing:async()=>{throw Error("not configured");},pastures:async()=>{throw Error("not configured");},pasture:async()=>{throw Error("not configured");},birthOptions:async()=>{throw Error("not configured");},previewBirth:async()=>{throw Error("not configured");},confirmBirth:async()=>{throw Error("not configured");},matingOptions:async()=>{throw Error("not configured");},matingSires:async()=>{throw Error("not configured");},previewMating:async()=>{throw Error("not configured");},confirmMating:async()=>{throw Error("not configured");},diagnosisOptions:async()=>{throw Error("not configured");},saveDiagnosis:async()=>{throw Error("not configured");},reproductionPage:async()=>{throw Error("not configured");},reproductionAnimal:async()=>{throw Error("not configured");},medicationOptions:async()=>{throw Error("not configured");},medicationLots:async()=>{throw Error("not configured");},previewMedication:async()=>{throw Error("not configured");},confirmMedication:async()=>{throw Error("not configured");},healthOptions:async()=>{throw Error("not configured");},createHealthRecord:async()=>{throw Error("not configured");},vaccinationOptions:async()=>{throw Error("not configured");},vaccinationTargets:async()=>{throw Error("not configured");},vaccinationVaccines:async()=>{throw Error("not configured");},previewVaccination:async()=>{throw Error("not configured");},confirmVaccination:async()=>{throw Error("not configured");},clinicOptions:async()=>{throw Error("not configured");},clinicPage:async()=>{throw Error("not configured");},clinicDetail:async()=>{throw Error("not configured");},clinicAnimals:async()=>{throw Error("not configured");},createClinicRecord:async()=>{throw Error("not configured");},notifications:async()=>{throw Error("not configured");},notification:async()=>{throw Error("not configured");},notificationCount:async()=>{throw Error("not configured");},changeNotification:async()=>{throw Error("not configured");},notificationPreferences:async()=>{throw Error("not configured");},saveNotificationPreferences:async()=>{throw Error("not configured");},dailyFeeding:async()=>{throw Error("not configured");},saveDailyFeeding:async()=>{throw Error("not configured");},feedPage:async()=>{throw Error("not configured");},feedDetail:async()=>{throw Error("not configured");},saveFeedFormula:async()=>{throw Error("not configured");},previewFeed:async()=>{throw Error("not configured");},confirmFeed:async()=>{throw Error("not configured");},stockLaunchOptions:async()=>{throw Error("not configured");},previewStockLaunch:async()=>{throw Error("not configured");},confirmStockLaunch:async()=>{throw Error("not configured");},inventoryMovements:async()=>{throw Error("not configured");},inventoryMovement:async()=>{throw Error("not configured");},inventoryLot:async()=>{throw Error("not configured");},countInventory:async()=>{throw Error("not configured");},inventoryFormChoices:async()=>{throw Error("not configured");},saveInventory:async()=>{throw Error("not configured");},inventorySummary:async()=>{throw Error("not configured");},inventoryChoices:async()=>{throw Error("not configured");},inventoryPage:async()=>{throw Error("not configured");},inventoryDetail:async()=>{throw Error("not configured");}, cattleOverview:async()=>{throw new Error('not configured');},saveCattleBatch:async()=>{throw new Error('not configured');},cattleTransfer:async()=>{throw new Error('not configured');}, milkSummary:async()=>{throw new Error('not configured');},milkPage:async()=>{throw new Error('not configured');},milkDetail:async()=>{throw new Error('not configured');},saveMilk:async()=>{throw new Error('not configured');}, saveCattleAnimal:async()=>{throw new Error('not configured');}, recordCattleWeight:async()=>{throw new Error('not configured');}, cattleList:async()=>{throw new Error('not configured');}, cattleDetail:async()=>{throw new Error('not configured');}, cattleHistory:async()=>{throw new Error('not configured');}, profile:async()=>({full_name:'Teste',email:'test@example.com'}), farms:async()=>({results:[],next:null}), searchEntities:async()=>({results:[],next:null,previous:null}), agendaOptions: async () => {throw new Error('not configured');}, saveAgendaTask: async () => {throw new Error('not configured');}, agenda: async () => ({count:0,next:null,previous:null,results:[]}), agendaTask: async () => { throw new Error('not configured'); }, google: async () => tokens, register: async () => {}, login: async () => tokens, user: async () => user, organization: async () => organization,
    dashboard: async () => { throw new Error('not configured'); }, logout: async () => { revokeCount++; }, recover: async () => {}, changePassword: async () => {}, ...overrides };
  const vault: TokenVault = { read: async () => saved, save: async value => { saved = value; }, clear: async () => { saved = null; } };
  const controller = new SessionController(api, vault, 'pt-BR');
  return { api, vault, controller, saved: () => saved, revoked: () => revokeCount };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('API URL rejects missing URL, unsafe protocols, embedded credentials and production HTTP', () => {
  for (const value of [undefined, '/api/v1', 'file:///api', 'https://user:secret@example.com', 'https://example.com?token=x', 'https://example.com/#x'])
    assert.equal(parseApiUrl(value, true), null);
  assert.equal(parseApiUrl('http://127.0.0.1:8000/api/v1', false), null);
  assert.equal(parseApiUrl('http://127.0.0.1:8000/api/v1', true), 'http://127.0.0.1:8000/api/v1/');
  assert.equal(parseApiUrl('https://api.example.com/api/v1///', false), 'https://api.example.com/api/v1/');
});
test('credentials normalize email whitespace but preserve the supplied password', () => {
  assert.deepEqual(credentialsSchema.parse({ email: ' test@example.com ', password: ' pass ' }), { email: 'test@example.com', password: ' pass ' });
  assert.equal(credentialsSchema.safeParse({ email: 'invalid', password: 'x' }).success, false);
  assert.equal(credentialsSchema.safeParse({ email: 'test@example.com', password: '' }).success, false);
});
test('mandatory password change validates minimum length and confirmation', () => {
  assert.equal(newPasswordSchema.safeParse({ password: 'short', confirmation: 'short' }).success, false);
  assert.equal(newPasswordSchema.safeParse({ password: 'long-password', confirmation: 'different' }).success, false);
  assert.equal(newPasswordSchema.safeParse({ password: 'long-password', confirmation: 'long-password' }).success, true);
});
test('all languages cover every login message and supported device locales resolve', () => {
  const keys = Object.keys(messages['pt-BR']).sort();
  for (const language of languages) {
    assert.deepEqual(Object.keys(messages[language]).sort(), keys);
    assert.ok(Object.values(messages[language]).every(value => value.length > 0));
  }
  assert.equal(resolveLanguage('en-US'), 'en'); assert.equal(resolveLanguage('es-AR'), 'es');
  assert.equal(resolveLanguage('pt-PT'), 'pt-PT'); assert.equal(resolveLanguage('fr-FR'), 'pt-BR');
});
test('response schemas reject incomplete access and discard unrelated organization fields', () => {
  assert.equal(userSchema.safeParse({ ...user, access: {} }).success, false);
  assert.equal(tokensSchema.safeParse({ access: '', refresh: 'x' }).success, false);
  assert.deepEqual(organizationSchema.parse({ ...organization, subscription: { amount: '999' } }), organization);
});
test('sign-in validates user and organization before storing tokens and uses organization language', async () => {
  const f = fixture(); await f.controller.restore();
  assert.equal(f.controller.getSnapshot().status, 'signedOut');
  await f.controller.signIn('test@example.com', 'password', true);
  assert.deepEqual(f.saved(), tokens);
  const state = f.controller.getSnapshot();
  assert.equal(state.status, 'signedIn');
  if (state.status === 'signedIn') assert.equal(state.session.organization.language, 'es');
});
test('failed credentials never persist a session', async () => {
  const f = fixture({ login: async () => { throw new AuthFailure('invalidCredentials'); } });
  await assert.rejects(f.controller.signIn('test@example.com', 'invalid'), /invalidCredentials/);
  assert.equal(f.saved(), null);
});
test('organization failure does not persist a partially validated session', async () => {
  const f = fixture({ organization: async () => { throw new AuthFailure('network'); } });
  await assert.rejects(f.controller.signIn('test@example.com', 'password', true), /network/);
  assert.equal(f.saved(), null); assert.equal(f.revoked(), 1);
});
test('platform and affiliate-only accounts cannot enter the tenant mobile area', async () => {
  for (const flags of [{ is_platform_staff: true }, { affiliate_portal_only: true }]) {
    const f = fixture({ user: async () => ({ ...user, ...flags }) });
    await assert.rejects(f.controller.signIn('test@example.com', 'password', true), /unsupported/);
    assert.equal(f.saved(), null); assert.equal(f.revoked(), 1);
  }
});
test('storage failure cannot be reported as successful login', async () => {
  const f = fixture(); f.vault.save = async () => { throw new Error('private implementation error'); };
  await assert.rejects(f.controller.signIn('test@example.com', 'password', true), /storage/);
  assert.notEqual(f.controller.getSnapshot().status, 'signedIn');
});
test('valid saved session is verified against API before opening content', async () => {
  const f = fixture(); await f.vault.save(tokens); await f.controller.restore();
  assert.equal(f.controller.getSnapshot().status, 'signedIn');
});
test('expired session is cleared and requires login instead of an unsafe refresh loop', async () => {
  const f = fixture({ user: async () => { throw new AuthFailure('expired'); } });
  await f.vault.save(tokens); await f.controller.restore();
  assert.equal(f.saved(), null); assert.equal(f.controller.getSnapshot().status, 'signedOut');
});
test('network failure during restore preserves tokens but blocks authenticated content', async () => {
  const f = fixture({ user: async () => { throw new AuthFailure('network'); } });
  await f.vault.save(tokens); await f.controller.restore();
  assert.deepEqual(f.saved(), tokens); assert.equal(f.controller.getSnapshot().status, 'unavailable');
});
test('logout clears local access even when remote logout is unavailable', async () => {
  const f = fixture({ logout: async () => { throw new Error('offline'); } });
  await f.controller.signIn('test@example.com', 'password', true); await f.controller.signOut();
  assert.equal(f.saved(), null); assert.equal(f.controller.getSnapshot().status, 'signedOut');
});
test('late restore result cannot reopen a session after logout', async () => {
  const result = deferred<typeof user>();
  const f = fixture({ user: () => result.promise }); await f.vault.save(tokens);
  const restoring = f.controller.restore(); await Promise.resolve();
  await f.controller.signOut(); result.resolve(user); await restoring;
  assert.equal(f.controller.getSnapshot().status, 'signedOut'); assert.equal(f.saved(), null);
});
test('concurrent login attempts produce one authentication request', async () => {
  const result = deferred<Tokens>(); let requests = 0;
  const f = fixture({ login: async () => { requests++; return result.promise; } });
  const first = f.controller.signIn('test@example.com', 'password', true);
  await f.controller.signIn('test@example.com', 'password', true); result.resolve(tokens); await first;
  assert.equal(requests, 1);
});
test('mandatory password-change flag is preserved until confirmed by API', async () => {
  let changed = false;
  const f = fixture({ user: async () => ({ ...user, force_password_change: !changed }), changePassword: async () => { changed = true; } });
  await f.controller.signIn('test@example.com', 'password', true);
  const before = f.controller.getSnapshot(); if (before.status === 'signedIn') assert.equal(before.session.user.force_password_change, true);
  await f.controller.changePassword('new-password', 'new-password');
  const after = f.controller.getSnapshot(); if (after.status === 'signedIn') assert.equal(after.session.user.force_password_change, false);
});
test('API uses existing endpoints, locale headers and bearer only on protected operations', async () => {
  const requests: { url?: string; authorization?: string; language?: string; data: unknown }[] = [];
  const adapter: AxiosAdapter = async config => {
    requests.push({ url: config.url, authorization: config.headers.get('Authorization') as string | undefined,
      language: config.headers.get('Accept-Language') as string | undefined, data: config.data });
    const data = config.url === 'auth/login/' ? tokens : config.url === 'auth/me/' ? user : config.url === 'organizations/me/' ? organization : {};
    return { data, config, status: 200, statusText: 'OK', headers: {} };
  };
  const api = createAuthApi('https://api.example.com/api/v1/', create({ adapter }));
  await api.login({ email: 'test@example.com', password: 'password' }, 'pt-BR');
  await api.user(tokens, 'en'); await api.organization(tokens, 'es'); await api.logout(tokens, 'es'); await api.recover('test@example.com', 'pt-PT');
  assert.equal(requests[0]?.authorization, undefined); assert.equal(requests[1]?.authorization, 'Bearer synthetic-access');
  assert.equal(requests[2]?.language, 'es'); assert.equal(requests[3]?.authorization, undefined);
  assert.equal(requests[4]?.url, 'auth/password-recovery/');
});
test('missing configuration never makes a request', async () => {
  const api = createAuthApi(null);
  await assert.rejects(api.login({ email: 'test@example.com', password: 'password' }, 'en'), /configuration/);
});
test('errors do not expose arbitrary server failures or unknown exception text', () => {
  const response = { status: 500, data: { detail: 'private stack trace' } } as AxiosResponse;
  const failure = authError(new AxiosError('secret', undefined, undefined, undefined, response));
  assert.equal(failure.key, 'server'); assert.equal(failure.detail, undefined);
  assert.equal(authError(new Error('secret')).detail, undefined);
  assert.equal(authError(new AxiosError('network')).key, 'network');
});

test('failed secure-storage deletion cannot reopen the logged-out session on retry', async () => {
  const f = fixture(); await f.controller.signIn('test@example.com', 'password', true);
  const clear = f.vault.clear;
  f.vault.clear = async () => { throw new Error('storage unavailable'); };
  await f.controller.signOut();
  assert.equal(f.controller.getSnapshot().status, 'unavailable');
  await f.controller.restore();
  assert.notEqual(f.controller.getSnapshot().status, 'signedIn');
  f.vault.clear = clear;
  await f.controller.restore();
  assert.equal(f.controller.getSnapshot().status, 'signedOut'); assert.equal(f.saved(), null);
});
test('expiry during mandatory password change ends local access', async () => {
  const f = fixture({ changePassword: async () => { throw new AuthFailure('expired'); } });
  await f.controller.signIn('test@example.com', 'password', true);
  await assert.rejects(f.controller.changePassword('new-password', 'new-password'), /expired/);
  assert.equal(f.controller.getSnapshot().status, 'signedOut'); assert.equal(f.saved(), null);
});
test('storage namespaces distinguish API URLs even when escaped paths look alike', () => {
  const first = sessionStorageKey('https://example.com/a/b/');
  const second = sessionStorageKey('https://example.com/a_2Fb/');
  assert.notEqual(first, second);
  assert.match(first, /^[a-zA-Z0-9._-]+$/);
  assert.notEqual(sessionStorageKey(null), first);
});

const registration = { full_name: 'Pessoa de teste', email: 'new@example.com', phone: '', phone_is_whatsapp: false,
  receive_system_alerts: false, password: 'valid-password', password_confirm: 'valid-password' };
test('registration validates name, minimum password and confirmation', () => {
  for (const change of [{ full_name: ' ' }, { password: 'short', password_confirm: 'short' }, { password_confirm: 'different' }])
    assert.equal(registrationSchema.safeParse({ ...registration, ...change }).success, false);
  assert.equal(registrationSchema.safeParse(registration).success, true);
});
test('WhatsApp phone is conditional; system alerts remain an independent opt-in', () => {
  assert.equal(registrationSchema.safeParse({ ...registration, phone_is_whatsapp: true }).success, false);
  assert.equal(registrationSchema.safeParse({ ...registration, phone_is_whatsapp: true, phone: '+55 85 99999-9999' }).success, true);
  assert.equal(registrationSchema.safeParse({ ...registration, receive_system_alerts: true }).success, true);
  assert.equal(registrationSchema.parse(registration).receive_system_alerts, false);
  assert.equal(registrationSchema.parse(registration).phone_is_whatsapp, false);
});
test('registration preserves password and rejects excessive name/phone length', () => {
  const values = registrationSchema.parse({ ...registration, full_name: ' Pessoa ', email: ' new@example.com ', password: ' pass word ', password_confirm: ' pass word ' });
  assert.equal(values.full_name, 'Pessoa'); assert.equal(values.email, 'new@example.com'); assert.equal(values.password, ' pass word ');
  assert.equal(registrationSchema.safeParse({ ...registration, full_name: 'x'.repeat(256) }).success, false);
  assert.equal(registrationSchema.safeParse({ ...registration, phone: '1'.repeat(31) }).success, false);
});
test('registration posts only allowed fields without authentication or automatic login', async () => {
  let calls = 0;
  const adapter: AxiosAdapter = async config => {
    calls++;
    assert.equal(config.url, 'auth/register/'); assert.equal(config.headers.get('Authorization'), undefined);
    assert.equal(config.headers.get('Accept-Language'), 'es');
    assert.deepEqual(JSON.parse(config.data), registration);
    return { data: { ...tokens, user }, config, status: 201, statusText: 'Created', headers: {} };
  };
  const api = createAuthApi('https://api.example.com/api/v1/', create({ adapter }));
  const result = await api.register({ ...registration, role: 'admin', organization: 'other-org' } as typeof registration, 'es');
  assert.equal(result, undefined); assert.equal(calls, 1);
});
test('registration maps standard Django error envelope to known fields', () => {
  const response = { status: 400, data: { error: { code: 'validation_error', message: 'Validation failed', detail: {
    email: ['Este e-mail já está cadastrado.'], password_confirm: ['As senhas não conferem.'], secret_internal: ['private'],
  } } } } as AxiosResponse;
  const failure = registrationError(new AxiosError('bad request', undefined, undefined, undefined, response));
  assert.ok(failure instanceof RegistrationFailure);
  assert.deepEqual(failure.fields, { email: 'Este e-mail já está cadastrado.', password_confirm: 'As senhas não conferem.' });
});
test('registration supports direct validation errors and keeps server exceptions private', () => {
  const response = { status: 400, data: { phone: ['Informe o telefone.'], non_field_errors: ['Revise os dados.'] } } as AxiosResponse;
  const failure = registrationError(new AxiosError('bad request', undefined, undefined, undefined, response));
  assert.ok(failure instanceof RegistrationFailure); assert.equal(failure.detail, 'Revise os dados.');
  assert.equal(failure.fields.phone, 'Informe o telefone.');
  const server = registrationError(new AxiosError('private', undefined, undefined, undefined,
    { status: 500, data: { detail: 'private stack' } } as AxiosResponse));
  assert.equal(server.detail, undefined); assert.equal(server.key, 'server');
});
test('uncertain registration result asks for reconciliation instead of automatic replay', () => {
  assert.equal(registrationError(new AxiosError('timeout')).key, 'registrationUnconfirmed');
});

test('unselected remember option keeps credentials out of persistent storage', async () => {
  const f = fixture(); await f.vault.save({ access: 'old', refresh: 'old' });
  await f.controller.signIn('test@example.com', 'password', false);
  assert.equal(f.saved(), null); assert.equal(f.controller.getSnapshot().status, 'signedIn');
  const reopened = new SessionController(f.api, f.vault, 'pt-BR'); await reopened.restore();
  assert.equal(reopened.getSnapshot().status, 'signedOut');
});
test('in-memory session survives foreground validation without remember option', async () => {
  const f = fixture(); await f.controller.signIn('test@example.com', 'password', false);
  await f.controller.restore();
  assert.equal(f.controller.getSnapshot().status, 'signedIn'); assert.equal(f.saved(), null);
});
test('remember option permits a new controller to restore a valid session', async () => {
  const f = fixture(); await f.controller.signIn('test@example.com', 'password', true);
  const reopened = new SessionController(f.api, f.vault, 'en'); await reopened.restore();
  assert.equal(reopened.getSnapshot().status, 'signedIn');
});
test('remember defaults to nonpersistent and logout still clears memory', async () => {
  const f = fixture(); await f.controller.signIn('test@example.com', 'password');
  assert.equal(f.saved(), null); await f.controller.signOut(); await f.controller.restore();
  assert.equal(f.controller.getSnapshot().status, 'signedOut');
});
test('expired in-memory credentials cannot be restored again', async () => {
  const f = fixture(); await f.controller.signIn('test@example.com', 'password', false);
  f.api.user = async () => { throw new AuthFailure('expired'); };
  await f.controller.restore();
  f.api.user = async () => user;
  await f.controller.restore(); assert.equal(f.controller.getSnapshot().status, 'signedOut');
});

test('legal links use the public website and existing Next.js routes', () => {
  assert.deepEqual(legalUrls(undefined, false), {
    terms: 'https://fazendamais.com/termos', privacy: 'https://fazendamais.com/privacidade', copyright: 'https://fazendamais.com/login/license',
  });
});
test('legal links support an explicit website environment without using the API host', () => {
  const urls = legalUrls('https://web.example.com', false);
  assert.equal(urls?.terms, 'https://web.example.com/termos');
  assert.equal(legalUrls('http://127.0.0.1:3000', true)?.privacy, 'http://127.0.0.1:3000/privacidade');
});
test('legal links reject credentials, relative paths and unsafe production protocols', () => {
  for (const value of ['/termos', 'javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com?token=x', 'http://web.example.com'])
    assert.equal(legalUrls(value, false), null);
});

test('financial home rejects operators without requesting financial data', async () => {
  let requests = 0;
  const f = fixture({ dashboard: async () => { requests++; throw new Error('forbidden call'); } });
  await f.controller.signIn('test@example.com', 'password');
  await assert.rejects(f.controller.dashboard('2026-11'), /unsupported/);
  assert.equal(requests, 0);
});
test('financial home discards a response that completes after logout', async () => {
  const result = deferred<Awaited<ReturnType<AuthApi['dashboard']>>>();
  const f = fixture({ user: async () => ({ ...user, access: { ...user.access, role: 'manager', can_view_financial: true } }), dashboard: async () => result.promise });
  await f.controller.signIn('test@example.com', 'password');
  const request = f.controller.dashboard('2026-11');
  await f.controller.signOut();
  result.resolve({ kpis: { month_revenue: 0, month_expense: 0, total_inventory_value: 0, inventory_items: 0, low_stock_items: 0, farms_count: 0 }, segments: { crops: { cost: 0, revenue: 0, profit: 0 }, livestock: { cost: 0, revenue: 0, profit: 0 } }, tasks: [], recent_activities: [] });
  await assert.rejects(request, /expired/);
  assert.equal(f.controller.getSnapshot().status, 'signedOut');
});

test('Google login validates profile and organization, preserves password change and remember policy', async () => {
  let credential = '';
  const f = fixture({ google: async value => { credential = value; return tokens; }, user: async () => ({ ...user, force_password_change:true }) });
  await f.controller.signInGoogle('synthetic-google-id-token');
  assert.equal(credential,'synthetic-google-id-token');
  assert.equal(f.saved(),null);
  const state = f.controller.getSnapshot();
  assert.equal(state.status,'signedIn');
  if (state.status === 'signedIn') assert.equal(state.session.user.force_password_change,true);
  const remembered = fixture();
  await remembered.controller.signInGoogle('synthetic-google-id-token',true);
  assert.deepEqual(remembered.saved(),tokens);
});
test('Google login cannot bypass platform-only restrictions or organization validation', async () => {
  for (const overrides of [
    { user: async () => ({ ...user, is_platform_staff:true }) },
    { organization: async () => { throw new AuthFailure('network'); } },
  ]) {
    const f = fixture(overrides);
    await assert.rejects(f.controller.signInGoogle('synthetic-google-id-token',true));
    assert.equal(f.saved(),null);
    assert.notEqual(f.controller.getSnapshot().status,'signedIn');
  }
});
test('Google and password share single-flight protection and late Google results cannot reopen logout', async () => {
  const pending = deferred<Tokens>(); let passwordRequests=0;
  const f = fixture({ google:async()=>pending.promise, login:async()=>{passwordRequests++;return tokens;} });
  const attempt=f.controller.signInGoogle('synthetic-google-id-token');
  await f.controller.signIn('test@example.com','password');
  assert.equal(passwordRequests,0);
  await f.controller.signOut();pending.resolve(tokens);await attempt;
  assert.equal(f.controller.getSnapshot().status,'signedOut');
});
test('Google API posts only the identity credential to the existing endpoint without bearer', async () => {
  const adapter: AxiosAdapter = async config => {
    assert.equal(config.url,'auth/google/');
    assert.deepEqual(JSON.parse(config.data),{credential:'synthetic-google-id-token'});
    assert.equal(config.headers.get('Authorization'),undefined);
    assert.equal(config.headers.get('Accept-Language'),'es');
    return { data:tokens,status:200,statusText:'OK',headers:{},config };
  };
  const api=createAuthApi('https://api.example.com/api/v1/',create({adapter}));
  assert.deepEqual(await api.google('synthetic-google-id-token','es'),tokens);
  await assert.rejects(api.google('','es'),/googleFailed/);
});
