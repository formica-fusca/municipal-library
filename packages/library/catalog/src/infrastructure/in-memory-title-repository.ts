import { InMemoryRepository } from '@local/ddd-core/testing'
import type { Isbn, TitleId } from '@local/shared-kernel'
import type { TitleRepository } from '../domain/title-repository.js'
import type { Title } from '../domain/title.js'

export class InMemoryTitleRepository
  extends InMemoryRepository<Title, TitleId>
  implements TitleRepository
{
  async findByIsbn(isbn: Isbn): Promise<Title | undefined> {
    for (const title of this.store.values()) {
      if (title.isbn.equals(isbn)) return title
    }
    return undefined
  }
}
