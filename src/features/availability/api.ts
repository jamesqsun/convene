import { z } from 'zod'
import {
  type SessionProvider,
  authed,
  authedMutation,
  sessionProvider,
} from '@/features/auth/session'
import { loadProfile } from '@/features/profile/store'
import { type Db, getDb } from '@/lib/db'
import { HttpError, type RouteHandler, jsonResponse, readJson } from '@/lib/http'
import { slotInputSchema, weekInputSchema } from './schemas'
import { type Slot, createSlot, reopenSlot, transitionSlot, updateSlot, windowFor } from './store'
import { expectedBatchAt, slotStateFor } from './slot-state'
import { isWeekStart, loadWeek, saveWeek } from './weeks'

export interface AvailabilityRouteDeps {
  getProvider: () => Promise<SessionProvider>
  getDatabase: () => Promise<Db>
  clock: () => number
}

/** A slot as the owner sees it: stored fields plus the derived state and expected batch time. */
export function slotResponse(slot: Slot, now: number) {
  return { ...slot, state: slotStateFor(slot, now), expectedBatchAt: expectedBatchAt(slot) }
}

async function timezoneFor(db: Db, userId: string): Promise<string> {
  const profile = await loadProfile(db, userId)
  if (!profile?.city)
    throw new HttpError(409, 'city_required', 'Choose your city before adding availability')
  return profile.city.timezone
}

const idSchema = z.uuid()

const weekStartSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

function weekStartOf(params: { weekStart?: string }, timezone: string): string {
  const parsed = weekStartSchema.safeParse(params.weekStart)
  if (!parsed.success || !isWeekStart(timezone, parsed.data)) {
    throw new HttpError(400, 'invalid_week', 'weekStart must be a Monday in your city time zone')
  }
  return parsed.data
}

function slotId(params: { id?: string }): string {
  const parsed = idSchema.safeParse(params.id)
  if (!parsed.success) throw new HttpError(404, 'slot_missing', 'Availability not found')
  return parsed.data
}

export function availabilityRoutes(deps: AvailabilityRouteDeps) {
  const respond = (slot: Slot, status = 200) =>
    jsonResponse({ slot: slotResponse(slot, deps.clock()) }, status)
  return {
    create: authedMutation(async (request, userId) => {
      const input = await readJson(request, slotInputSchema)
      const db = await deps.getDatabase()
      const timezone = await timezoneFor(db, userId)
      return respond(
        await createSlot(db, userId, windowFor(input, timezone, deps.clock()), timezone),
        201,
      )
    }, deps.getProvider),
    update: authedMutation<{ id: string }>(async (request, userId, params) => {
      const input = await readJson(request, slotInputSchema)
      const db = await deps.getDatabase()
      const timezone = await timezoneFor(db, userId)
      return respond(
        await updateSlot(db, userId, slotId(params), windowFor(input, timezone, deps.clock())),
      )
    }, deps.getProvider),
    pause: authedMutation<{ id: string }>(async (_request, userId, params) => {
      return respond(
        await transitionSlot(
          await deps.getDatabase(),
          userId,
          slotId(params),
          ['pending'],
          'paused',
        ),
      )
    }, deps.getProvider),
    reopen: authedMutation<{ id: string }>(async (_request, userId, params) => {
      return respond(
        await reopenSlot(await deps.getDatabase(), userId, slotId(params), deps.clock()),
      )
    }, deps.getProvider),
    remove: authedMutation<{ id: string }>(async (_request, userId, params) => {
      await transitionSlot(
        await deps.getDatabase(),
        userId,
        slotId(params),
        ['pending', 'paused'],
        'cancelled',
      )
      return new Response(null, { status: 204 })
    }, deps.getProvider),
    week: authed<{ weekStart: string }>(async (_request, userId, params) => {
      const db = await deps.getDatabase()
      const timezone = await timezoneFor(db, userId)
      return jsonResponse({
        week: await loadWeek(db, userId, weekStartOf(params, timezone), timezone, deps.clock()),
      })
    }, deps.getProvider),
    saveWeek: authedMutation<{ weekStart: string }>(async (request, userId, params) => {
      const input = await readJson(request, weekInputSchema)
      const db = await deps.getDatabase()
      const timezone = await timezoneFor(db, userId)
      const weekStart = weekStartOf(params, timezone)
      const result = await saveWeek(db, userId, weekStart, input.windows, timezone, deps.clock())
      return jsonResponse({
        result,
        week: await loadWeek(db, userId, weekStart, timezone, deps.clock()),
      })
    }, deps.getProvider),
  }
}

const routes = availabilityRoutes({
  getProvider: sessionProvider,
  getDatabase: getDb,
  clock: Date.now,
})
export const POST: RouteHandler = routes.create
export const PATCH: RouteHandler<{ id: string }> = routes.update
export const POST_pause: RouteHandler<{ id: string }> = routes.pause
export const POST_reopen: RouteHandler<{ id: string }> = routes.reopen
export const DELETE: RouteHandler<{ id: string }> = routes.remove
export const GET_week: RouteHandler<{ weekStart: string }> = routes.week
export const PUT_week: RouteHandler<{ weekStart: string }> = routes.saveWeek
