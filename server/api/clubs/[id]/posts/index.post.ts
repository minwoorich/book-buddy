import { clubPostService } from '../../../../services/clubPostService'
import { handleApi, requireUser, requireIdParam } from '../../../../utils/api'

/** 글 또는 댓글(parentId). */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = requireIdParam(event, '모임 번호')
    const body = await readBody<{ body?: unknown; parentId?: unknown }>(event)
    const parentId = body?.parentId === undefined || body?.parentId === null ? null : Number(body.parentId)
    return clubPostService.create(id, me.id, {
      body: typeof body?.body === 'string' ? body.body : '',
      parentId: parentId !== null && Number.isInteger(parentId) && parentId > 0 ? parentId : null,
    })
  })
)
