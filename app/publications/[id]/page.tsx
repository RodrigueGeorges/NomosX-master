import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export default async function PublicationRedirect() {
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || '';
  const id = pathname.split('/').pop();
  
  if (id) {
    redirect(`/articles/${id}`);
  } else {
    redirect('/articles');
  }
}