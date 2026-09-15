import { postTagRepo } from '../../repositories/postTagRepo'
import { handleApi } from '../../utils/api'

/** 많이 쓰인 해시태그 순(동률이면 최근). 글쓰기 모달의 태그 제안에 쓴다. */
export default defineEventHandler(handleApi(() => postTagRepo.popular(12)))
