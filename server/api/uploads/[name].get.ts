import { uploadService } from '../../services/uploadService'
import { handleApi } from '../../utils/api'

export default defineEventHandler(
  handleApi(async (event) => {
    const name = getRouterParam(event, 'name') ?? ''
    const { data, type } = uploadService.serve(name)
    setHeader(event, 'content-type', type)
    return data
  })
)
