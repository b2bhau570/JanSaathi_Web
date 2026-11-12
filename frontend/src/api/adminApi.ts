import client from './client';
import type { Doctor } from '../types';

export async function getPendingDoctors(): Promise<Doctor[]> {
  const res = await client.get<Doctor[]>('/admin/doctors', {
    params: { status: 'pending' },
  });
  return res.data;
}

export async function getAllDoctors(): Promise<Doctor[]> {
  const res = await client.get<Doctor[]>('/admin/doctors');
  return res.data;
}

export async function approveDoctor(doctorId: string): Promise<void> {
  await client.post(`/admin/doctors/${doctorId}/approve`);
}

export async function rejectDoctor(doctorId: string): Promise<void> {
  await client.post(`/admin/doctors/${doctorId}/reject`);
}

export async function suspendDoctor(doctorId: string): Promise<void> {
  await client.post(`/admin/doctors/${doctorId}/suspend`);
}

export async function reinstateDoctor(doctorId: string): Promise<void> {
  await client.post(`/admin/doctors/${doctorId}/reinstate`);
}
