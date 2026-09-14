import { homeService } from '../../services/homeService'
import { handleApi } from '../../utils/api'

export default defineEventHandler(
  handleApi(async () => {
    return homeService.getHomeSections()
  })
)
