import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})

//async function deleteTask(id) {
  //  if (!confirm("Delete this task?")) return;
//
  //  await fetch(`/api/tasks/${id}`, {
    //    method: "DELETE",
      //  headers: {
        //    Authorization: `Bearer ${token}`
        //}
   // });
//
  //  loadTasks();
//}
