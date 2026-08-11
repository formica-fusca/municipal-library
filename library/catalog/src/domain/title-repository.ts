import type { Repository } from '@local/ddd-core'
import type { Isbn, TitleId } from '@local/shared-kernel'
import type { Title } from './title.js'

/**
 * Stated in the domain layer, implemented in `infrastructure/`.
 *
 * `findByIsbn` is here because "look it up by its ISBN" is something a
 * librarian says. A method like `findWhere(sqlFragment)` would not be — that
 * would be the storage technology leaking upwards into the model's vocabulary.
 */
export interface TitleRepository extends Repository<Title, TitleId> {
  findByIsbn(isbn: Isbn): Promise<Title | undefined>
}
