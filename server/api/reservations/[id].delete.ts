import { reservationRepo } from '../../repositories/reservationRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = Number(getRouterParam(event, 'id'))

    const reservation = reservationRepo.findById(id)
    if (!reservation) throw new ApiError(404, '없는 예약이에요')
    if (reservation.userId !== me.id) throw new ApiError(403, '본인의 예약만 취소할 수 있어요')
    if (reservation.status !== 'waiting') throw new ApiError(409, '취소할 수 없는 예약이에요')

    reservationRepo.updateStatus(id, 'canceled')
    setResponseStatus(event, 204)
    return null
  })
)
